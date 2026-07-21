/* oxlint-disable eslint(max-lines) */
import type { Client, Integration, Span } from '@sentry/core';

import {
  addBreadcrumb,
  debug,
  getClient,
  isPlainObject,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_OK,
  spanToJSON,
  startInactiveSpan,
  timestampInSeconds,
} from '@sentry/core';

import type { UnsafeAction } from '../vendor/react-navigation/types';
import type { PendingDeepLink } from './pendingDeepLink';
import type { ReactNativeTracingIntegration } from './reactnativetracing';

import { getAppRegistryIntegration } from '../integrations/appRegistry';
import { sanitizeDeepLinkUrl } from '../integrations/deeplink';
import { isSentrySpan } from '../utils/span';
import { RN_GLOBAL_OBJ } from '../utils/worldwide';
import { NATIVE } from '../wrapper';
import {
  ignoreEmptyBackNavigation,
  ignoreEmptyRouteChangeTransactions,
  markRootSpanForDiscard,
} from './onSpanEndUtils';
import { SPAN_ORIGIN_AUTO_NAVIGATION_REACT_NAVIGATION } from './origin';
import {
  consumePendingDeepLink,
  nextEventSeq,
  peekPendingDeepLink,
  setPendingDeepLinkListener,
} from './pendingDeepLink';
import { consumePendingExpoRouterNavigation } from './pendingExpoRouterNavigation';
import { getReactNativeTracingIntegration } from './reactnativetracing';
import { SEMANTIC_ATTRIBUTE_NAVIGATION_ACTION_TYPE, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from './semanticAttributes';
import {
  DEFAULT_NAVIGATION_SPAN_NAME,
  defaultIdleOptions,
  getDefaultIdleNavigationSpanOptions,
  startIdleNavigationSpan as startGenericIdleNavigationSpan,
} from './span';
import { addTimeToInitialDisplayFallback } from './timeToDisplayFallback';

export const INTEGRATION_NAME = 'ReactNavigation';

const NAVIGATION_HISTORY_MAX_SIZE = 200;

/**
 * Extracts dynamic route parameters from a route name and its params.
 * Matches Expo Router style dynamic segments like `[id]` and `[...slug]`.
 *
 * Only params whose keys appear as dynamic segments in the route name are returned,
 * filtering out non-structural params (query params, etc.) that may contain PII.
 *
 * Note: dynamic segment values (e.g. the `123` in `profile/[id]`) may be user-identifiable.
 * This function only extracts params — callers are responsible for checking `sendDefaultPii`
 * before including the result in span attributes.
 *
 * Previous route params are intentionally not captured — only the current route's
 * structural params are needed for trace attribution.
 */
export function extractDynamicRouteParams(
  routeName: string,
  params?: Record<string, unknown>,
): Record<string, string> | undefined {
  if (!params) {
    return undefined;
  }

  const dynamicKeys = new Set<string>();
  const pattern = /\[(?:\.\.\.)?(\w+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(routeName)) !== null) {
    if (match[1]) {
      dynamicKeys.add(match[1]);
    }
  }

  if (dynamicKeys.size === 0) {
    return undefined;
  }

  const result: Record<string, string> = {};
  for (const key of dynamicKeys) {
    if (key in params) {
      const value = params[key];
      result[`route.params.${key}`] = Array.isArray(value) ? value.join('/') : String(value ?? '');
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Optional route override provided by another integration (e.g. Expo Router).
 *
 * When supplied, the route name and related attributes are derived from this
 * override instead of React Navigation's `getCurrentRoute().name`, so we can
 * report meaningful templated paths (e.g. `/profile/[id]`) instead of file
 * names like `index` or `(tabs)`.
 */
export interface RouteOverride {
  // templated pathname such as `/profile/[id]`. Used as the span name and `route.path` attribute
  templatedPath: string;
  // concrete URL with resolved values, e.g. `/profile/123?foo=bar`
  concreteUrl?: string;
  // merged route params (path + query)
  params?: Record<string, unknown>;
}

export type RouteOverrideProvider = () => RouteOverride | undefined;

/**
 * Builds a full path from the navigation state by traversing nested navigators.
 * For example, with nested navigators: "Home/Settings/Profile"
 */
function getPathFromState(state?: NavigationState): string | undefined {
  if (!state) {
    return undefined;
  }

  const routeNames: string[] = [];
  let currentState: NavigationState | undefined = state;

  while (currentState) {
    const index: number = currentState.index ?? 0;
    const route: NavigationRoute | undefined = currentState.routes[index];
    if (route?.name) {
      routeNames.push(route.name);
    }
    currentState = route?.state;
  }

  return routeNames.length > 0 ? routeNames.join('/') : undefined;
}

interface ReactNavigationIntegrationOptions {
  /**
   * How long the instrumentation will wait for the route to mount after a change has been initiated,
   * before the transaction is discarded.
   *
   * @default 1_000 (ms)
   */
  routeChangeTimeoutMs: number;

  /**
   * Time to initial display measures the time it takes from
   * navigation dispatch to the render of the first frame of the new screen.
   *
   * Note: Enabling this adds native bridge calls on every navigation
   * which may cause noticeable overhead on low-end devices.
   *
   * @default false
   */
  enableTimeToInitialDisplay: boolean;

  /**
   * Does not sample transactions that are from routes that have been seen any more and don't have any spans.
   * This removes a lot of the clutter as most back navigation transactions are now ignored.
   *
   * @default true
   */
  ignoreEmptyBackNavigationTransactions: boolean;

  /**
   * Enabled measuring Time to Initial Display for routes that are already loaded in memory.
   * (a.k.a., Routes that the navigation integration has already seen.)
   *
   * @default false
   */
  enableTimeToInitialDisplayForPreloadedRoutes: boolean;

  /**
   * Whether to use the dispatched action data to populate the transaction metadata.
   *
   * @default false
   */
  useDispatchedActionData: boolean;

  /**
   * Whether to use the full paths for navigation routes.
   *
   * @default false
   */
  useFullPathsForNavigationRoutes: boolean;

  /**
   * Track performance of route prefetching operations.
   * Creates separate spans for PRELOAD actions to measure prefetch performance.
   * This is useful for Expo Router apps that use the prefetch functionality.
   *
   * @default false
   */
  enablePrefetchTracking: boolean;
}

/**
 * Instrumentation for React-Navigation V5 and above. See docs or sample app for usage.
 *
 * How this works:
 * - `_onDispatch` is called every time a dispatch happens and sets an IdleTransaction on the scope without any route context.
 * - `_onStateChange` is then called AFTER the state change happens due to a dispatch and sets the route context onto the active transaction.
 * - If `_onStateChange` isn't called within `STATE_CHANGE_TIMEOUT_DURATION` of the dispatch, then the transaction is not sampled and finished.
 */
export const reactNavigationIntegration = ({
  routeChangeTimeoutMs = 1_000,
  enableTimeToInitialDisplay = false,
  ignoreEmptyBackNavigationTransactions = true,
  enableTimeToInitialDisplayForPreloadedRoutes = false,
  useDispatchedActionData = false,
  useFullPathsForNavigationRoutes = false,
  enablePrefetchTracking = false,
}: Partial<ReactNavigationIntegrationOptions> = {}): Integration & {
  /**
   * Pass the ref to the navigation container to register it to the instrumentation
   * @param navigationContainerRef Ref to a `NavigationContainer`
   */
  registerNavigationContainer: (navigationContainerRef: unknown) => void;
  /**
   * @internal API: allow another integration (for example, Expo Router integration) to
   * supply the canonical route info on every state change. Use `undefined` to clear.
   */
  _setRouteOverrideProvider: (provider: RouteOverrideProvider | undefined) => void;
  options: ReactNavigationIntegrationOptions;
} => {
  let navigationContainer: NavigationContainer | undefined;
  let routeOverrideProvider: RouteOverrideProvider | undefined;

  let tracing: ReactNativeTracingIntegration | undefined;
  let idleSpanOptions: Parameters<typeof startGenericIdleNavigationSpan>[1] = defaultIdleOptions;
  let latestRoute: NavigationRoute | undefined;

  let latestNavigationSpan: Span | undefined;
  let latestNavigationSpanNameCustomized: boolean = false;
  let navigationProcessingSpan: Span | undefined;
  /**
   * The first nav span that successfully completed a state change — i.e. the
   * span that mounted the app's initial route. Used (and only used) by the
   * deep-link listener as a retroactive attribution target for `cold-start`
   * links that arrive after that state change but before the span's idle
   * timeout fires. This is the Expo-Router-auto-handled-cold-start case.
   *
   * Never updated after the first successful state change — a `cold-start`
   * link must never retroactively tag a span the user navigated to later.
   * `warm-open` links bypass this entirely and always wait in the pending
   * slot for the next dispatched navigation.
   */
  let initialFinalizedNavSpan: Span | undefined;

  /**
   * Monotonic dispatch sequence per span, drawn from the shared `nextEventSeq`
   * counter. Used to reject warm-open links that arrived *before* a dispatch —
   * such links cannot have caused that dispatch, so the span must not be
   * tagged with them.
   */
  const spanDispatchSeq = new WeakMap<Span, number>();

  /**
   * Attempts to attach the pending deep link to the given span. Returns `true`
   * when the link was attached.
   *
   * Warm-open links only attach to spans dispatched *after* the link was
   * received. This prevents an unrelated, already-in-flight navigation from
   * being tagged when a deep link arrives mid-dispatch but is actually the
   * trigger of a subsequent navigation.
   *
   * Cold-start links attach unconditionally — retroactive attribution to the
   * initial nav span is the whole point of that source.
   *
   * Rejected warm-open links are left in the slot to be picked up by the next
   * eligible span.
   */
  const applyPendingDeepLinkToSpan = (span: Span, maxAgeMs: number): boolean => {
    const pending = peekPendingDeepLink(maxAgeMs);
    if (!pending) {
      return false;
    }
    if (pending.source === 'warm-open') {
      const spanSeq = spanDispatchSeq.get(span);
      if (spanSeq === undefined || spanSeq <= pending.seq) {
        // Span was dispatched before (or at the same tick as) the link arrived
        // — it cannot be the navigation the link triggered. Leave the link in
        // the slot for the next eligible span.
        return false;
      }
    }
    consumePendingDeepLink(maxAgeMs);
    return tagSpanWithDeepLink(span, pending);
  };

  /**
   * Synchronous listener invoked the moment a deep link is recorded. Returns
   * `true` only when the link was actually attached to a span — in that case
   * the pendingDeepLink module skips storing the value. Returns `false` to let
   * the link fall through to the pending slot for the next dispatched nav.
   *
   * Only `cold-start` links may retroactively tag an existing span. The
   * realistic warm-open flow is "`'url'` event → user handler synchronously
   * calls `navigation.navigate`": at listener invocation time no link-driven
   * dispatch has happened yet, so any span we could reach belongs to an
   * unrelated, prior navigation.
   */
  const handleLateDeepLink = (link: PendingDeepLink): boolean => {
    if (link.source !== 'cold-start') {
      return false;
    }
    // Prefer an in-flight span (dispatch happened, state change pending).
    if (latestNavigationSpan && isSpanRecording(latestNavigationSpan)) {
      return tagSpanWithDeepLink(latestNavigationSpan, link);
    }
    // Fallback: the initial nav span may have already mounted its route but
    // still be recording within its idle window (e.g. Expo Router auto-handled
    // the link before our own `getInitialURL()` chain resolved).
    if (initialFinalizedNavSpan && isSpanRecording(initialFinalizedNavSpan)) {
      return tagSpanWithDeepLink(initialFinalizedNavSpan, link);
    }
    return false;
  };

  let initialStateHandled: boolean = false;
  let isSetupComplete: boolean = false;
  let stateChangeTimeout: ReturnType<typeof setTimeout> | undefined;
  let recentRouteKeys: string[] = [];

  if (enableTimeToInitialDisplay) {
    NATIVE.initNativeReactNavigationNewFrameTracking().catch((reason: unknown) => {
      debug.error(`${INTEGRATION_NAME} Failed to initialize native new frame tracking: ${reason}`);
    });
  }

  /**
   * Set the initial state and start initial navigation span for the current screen.
   */
  const afterAllSetup = (client: Client): void => {
    tracing = getReactNativeTracingIntegration(client);
    if (tracing) {
      idleSpanOptions = {
        finalTimeout: tracing.options.finalTimeoutMs,
        idleTimeout: tracing.options.idleTimeoutMs,
      };
    }

    // Listen for deep links as they arrive so we can attribute a span that has
    // already mounted its route but not yet ended (e.g. Expo Router auto-handled
    // the link before our integration's `getInitialURL()` chain resolved).
    setPendingDeepLinkListener(handleLateDeepLink);
    client.on('close', () => {
      setPendingDeepLinkListener(undefined);
    });

    if (initialStateHandled) {
      // We create an initial state here to ensure a transaction gets created before the first route mounts.
      // This assumes that the Sentry.init() call is made before the first route mounts.
      // If this is not the case, the first transaction will be nameless 'Route Changed'
      return undefined;
    }

    getAppRegistryIntegration(client)?.onRunApplication(() => {
      if (initialStateHandled) {
        // To avoid conflict with the initial transaction we check if it was already handled.
        // This ensures runApplication calls after the initial start are correctly traced.
        // This is used for example when Activity is (re)started on Android.
        debug.log('[ReactNavigationIntegration] Starting new idle navigation span based on runApplication call.');
        startIdleNavigationSpan(undefined, true);
      }
    });

    isSetupComplete = true;

    if (!navigationContainer) {
      // This is expected as navigation container is registered after the root component is mounted.
      return undefined;
    }

    // Navigation container already registered, create and populate initial span
    startIdleNavigationSpan();
    updateLatestNavigationSpanWithCurrentRoute();
    initialStateHandled = true;
  };

  const registerNavigationContainer = (maybeNewNavigationContainer: unknown): void => {
    if (RN_GLOBAL_OBJ.__sentry_rn_v5_registered) {
      debug.log(`${INTEGRATION_NAME} Instrumentation already exists, but registering again...`);
      // In the past we have not allowed re-registering the navigation container to avoid unexpected behavior.
      // But this doesn't work for Android and re-recreating application main activity.
      // Where new navigation container is created and the old one is discarded. We need to re-register to
      // trace the new navigation container navigation.
    }

    let newNavigationContainer: NavigationContainer | undefined;
    if (isPlainObject(maybeNewNavigationContainer) && 'current' in maybeNewNavigationContainer) {
      newNavigationContainer = maybeNewNavigationContainer.current as NavigationContainer;
    } else {
      newNavigationContainer = maybeNewNavigationContainer as NavigationContainer;
    }

    if (navigationContainer === newNavigationContainer) {
      debug.log(`${INTEGRATION_NAME} Navigation container ref is the same as the one already registered.`);
      return;
    }
    navigationContainer = newNavigationContainer;

    if (!navigationContainer) {
      debug.warn(`${INTEGRATION_NAME} Received invalid navigation container ref!`);
      return undefined;
    }

    // This action is emitted on every dispatch
    navigationContainer.addListener('__unsafe_action__', startIdleNavigationSpan);
    // React Navigation fires `emit('state')` synchronously BEFORE the
    // `onStateChange` prop callback. Integrations like Expo Router refresh
    // their route cache (which our route override provider reads) inside that
    // `onStateChange`, so reading the override synchronously here would return
    // the previous route for the current transition. Defer with a microtask
    // so the read happens after the synchronous state-change chain completes
    // and downstream caches have caught up. See #6436.
    navigationContainer.addListener('state', scheduleUpdateLatestNavigationSpanWithCurrentRoute);
    RN_GLOBAL_OBJ.__sentry_rn_v5_registered = true;

    if (initialStateHandled) {
      return undefined;
    }

    if (!latestNavigationSpan) {
      if (!isSetupComplete) {
        debug.log(
          `${INTEGRATION_NAME} Navigation container registered before integration setup. Initial span will be created when setup completes.`,
        );
        return undefined;
      }
      startIdleNavigationSpan();
    }

    // Navigation Container is registered after the first navigation
    // Initial navigation span was started, after integration setup,
    // so now we populate it with the current route.
    updateLatestNavigationSpanWithCurrentRoute();
    initialStateHandled = true;
  };

  /**
   * Returns `true` when the given route name is focused at some level of the
   * current navigation state — i.e. it is on the chain of active routes from
   * the root navigator down to the leaf. Falls back to comparing against the
   * leaf route only when the full state is not available.
   */
  const isRouteFocused = (routeName: string): boolean => {
    try {
      const rootState = navigationContainer?.getState();
      let currentState: NavigationState | undefined = rootState;
      while (currentState) {
        const route: NavigationRoute | undefined = currentState.routes[currentState.index ?? 0];
        if (route?.name === routeName) {
          return true;
        }
        currentState = route?.state;
      }
      if (!rootState) {
        return navigationContainer?.getCurrentRoute()?.name === routeName;
      }
    } catch (e) {
      debug.warn(`${INTEGRATION_NAME} Failed to read navigation state to check focused route.`, e);
    }
    return false;
  };

  /**
   * To be called on every React-Navigation action dispatch.
   * It does not name the transaction or populate it with route information. Instead, it waits for the state to fully change
   * and gets the route information from there, @see updateLatestNavigationSpanWithCurrentRoute
   *
   * @param unknownEvent - The event object that contains navigation action data
   * @param isAppRestart - Whether this span is being started due to an app restart rather than a normal navigation action
   */
  // oxlint-disable-next-line eslint(complexity)
  const startIdleNavigationSpan = (unknownEvent?: unknown, isAppRestart = false): void => {
    const event = unknownEvent as UnsafeAction | undefined;
    const actionType = event?.data?.action?.type;
    const targetRouteName = getRouteNameFromAction(event);

    // Always drain the pending Expo Router value on this listener invocation —
    // even if we end up short-circuiting below (noop / PRELOAD / drawer /
    // missing route name). If the underlying router call did not produce an
    // idle nav span, the value must not leak onto the next, unrelated
    // navigation. Apply it only if we actually create `latestNavigationSpan`.
    const pendingExpoRouter = consumePendingExpoRouterNavigation();

    if (event && !isAppRestart && !event.data?.noop) {
      addBreadcrumb({
        category: 'navigation.dispatch',
        type: 'navigation',
        message: targetRouteName
          ? `Dispatched ${actionType ?? 'NAVIGATE'} to ${targetRouteName}`
          : `Dispatched ${actionType ?? 'NAVIGATE'}`,
        data: {
          ...(actionType ? { action_type: actionType } : undefined),
          ...(targetRouteName ? { to: targetRouteName } : undefined),
        },
        level: 'info',
      });
    }

    if (useDispatchedActionData && event?.data.noop) {
      debug.log(`${INTEGRATION_NAME} Navigation action is a noop, not starting navigation span.`);
      return;
    }

    const navigationActionType = useDispatchedActionData ? actionType : undefined;

    // Handle PRELOAD actions separately if prefetch tracking is enabled
    if (enablePrefetchTracking && navigationActionType === 'PRELOAD') {
      const preloadData = event?.data.action;
      const payload = preloadData?.payload;
      const targetRoute =
        payload && typeof payload === 'object' && 'name' in payload && typeof payload.name === 'string'
          ? payload.name
          : 'Unknown Route';

      debug.log(`${INTEGRATION_NAME} Starting prefetch span for route: ${targetRoute}`);

      const prefetchSpan = startInactiveSpan({
        op: 'navigation.prefetch',
        name: `Prefetch ${targetRoute}`,
        attributes: {
          'route.name': targetRoute,
        },
      });

      // Store prefetch span to end it when state changes or timeout
      navigationProcessingSpan = prefetchSpan;

      // Set timeout to ensure we don't leave hanging spans
      stateChangeTimeout = setTimeout(() => {
        if (navigationProcessingSpan === prefetchSpan) {
          debug.log(`${INTEGRATION_NAME} Prefetch span timed out for route: ${targetRoute}`);
          prefetchSpan?.setStatus({ code: SPAN_STATUS_OK });
          prefetchSpan?.end();
          navigationProcessingSpan = undefined;
        }
      }, routeChangeTimeoutMs);

      return;
    }

    if (
      useDispatchedActionData &&
      navigationActionType &&
      [
        // Process common actions
        'PRELOAD', // Still filter PRELOAD when enablePrefetchTracking is false
        'SET_PARAMS',
        // Drawer actions
        'OPEN_DRAWER',
        'CLOSE_DRAWER',
        'TOGGLE_DRAWER',
      ].includes(navigationActionType)
    ) {
      debug.log(`${INTEGRATION_NAME} Navigation action is ${navigationActionType}, not starting navigation span.`);
      return;
    }

    // A POP_TO whose target route is already focused is not a user-facing
    // navigation — it's a params-only bookkeeping dispatch. Expo Router emits
    // exactly this right after a `withAnchor` navigation, purely to stamp
    // `initial: false` onto the destination it just navigated to. Starting a
    // span here would either discard the real navigation's in-flight span
    // (state changes are processed in a deferred microtask, see #6436) or
    // ship a spurious duplicate transaction that steals the real navigation's
    // child spans. A genuine `popTo` is safe from this filter: its target is
    // a route *behind* the focused one, and `__unsafe_action__` fires before
    // the state change is applied, so the target is never focused here.
    if (navigationActionType === 'POP_TO' && targetRouteName && isRouteFocused(targetRouteName)) {
      debug.log(
        `${INTEGRATION_NAME} POP_TO targets the already focused route ${targetRouteName}, not starting navigation span.`,
      );
      return;
    }

    // Extract route name from dispatch action payload when available
    const dispatchedRouteName = useDispatchedActionData ? targetRouteName : undefined;
    if (useDispatchedActionData && event && !dispatchedRouteName && !isAppRestart) {
      debug.log(`${INTEGRATION_NAME} Navigation action has no route name in payload, not starting navigation span.`);
      return;
    }

    if (latestNavigationSpan) {
      debug.log(`${INTEGRATION_NAME} A transaction was detected that turned out to be a noop, discarding.`);
      _discardLatestTransaction();
      clearStateChangeTimeout();
    }

    const spanOptions = getDefaultIdleNavigationSpanOptions();
    if (dispatchedRouteName) {
      spanOptions.name = dispatchedRouteName;
    }

    const originalName = spanOptions.name;
    const finalSpanOptions = tracing?.options.beforeStartSpan
      ? tracing.options.beforeStartSpan(spanOptions)
      : spanOptions;
    latestNavigationSpanNameCustomized = finalSpanOptions.name !== originalName;

    latestNavigationSpan = startGenericIdleNavigationSpan(finalSpanOptions, { ...idleSpanOptions, isAppRestart });
    latestNavigationSpan?.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SPAN_ORIGIN_AUTO_NAVIGATION_REACT_NAVIGATION);
    latestNavigationSpan?.setAttribute(SEMANTIC_ATTRIBUTE_NAVIGATION_ACTION_TYPE, navigationActionType);

    if (pendingExpoRouter && latestNavigationSpan) {
      latestNavigationSpan.setAttribute('navigation.method', pendingExpoRouter.method);
    }

    // Stamp the span with a monotonic sequence so the deep-link consumer can
    // determine whether a pending link arrived before or after this dispatch.
    if (latestNavigationSpan) {
      spanDispatchSeq.set(latestNavigationSpan, nextEventSeq());
    }

    // We deliberately do NOT consume the pending deep link here — if this span
    // is later discarded (noop / timeout / empty route), a still-fresh pending
    // value must remain available for the next nav. The pending value is
    // consumed once a span actually mounts its route (see
    // `updateLatestNavigationSpanWithCurrentRoute`).
    if (ignoreEmptyBackNavigationTransactions) {
      ignoreEmptyBackNavigation(getClient(), latestNavigationSpan);
    }
    // Always discard transactions that never receive route information
    const spanToCheck = latestNavigationSpan;
    const spanName = finalSpanOptions.name ?? DEFAULT_NAVIGATION_SPAN_NAME;
    ignoreEmptyRouteChangeTransactions(getClient(), spanToCheck, spanName, () => latestNavigationSpan === spanToCheck);

    if (enableTimeToInitialDisplay && latestNavigationSpan) {
      NATIVE.setActiveSpanId(latestNavigationSpan.spanContext().spanId);
      navigationProcessingSpan = startInactiveSpan({
        op: 'navigation.processing',
        name: 'Navigation dispatch to navigation cancelled or screen mounted',
        startTime: spanToJSON(latestNavigationSpan).start_timestamp,
      });
      navigationProcessingSpan.setAttribute(
        SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
        SPAN_ORIGIN_AUTO_NAVIGATION_REACT_NAVIGATION,
      );
    }

    stateChangeTimeout = setTimeout(_discardLatestTransaction, routeChangeTimeoutMs);
  };

  /**
   * Defer {@link updateLatestNavigationSpanWithCurrentRoute} until the current
   * synchronous state-change chain unwinds so route override providers backed
   * by a downstream cache (e.g. Expo Router's router-store, which is refreshed
   * via `NavigationContainer.onStateChange`) have picked up the new route. See
   * #6436.
   */
  const scheduleUpdateLatestNavigationSpanWithCurrentRoute = (): void => {
    const g = globalThis as unknown as { queueMicrotask?: (cb: () => void) => void };
    if (typeof g.queueMicrotask === 'function') {
      g.queueMicrotask(updateLatestNavigationSpanWithCurrentRoute);
      return;
    }
    // Fallback for runtimes without `queueMicrotask`. `.catch()` handler is
    // there only to satisfy the `no-floating-promises` lint — the update
    // function does not throw.
    Promise.resolve()
      .then(updateLatestNavigationSpanWithCurrentRoute)
      .catch(() => {});
  };

  /**
   * To be called AFTER the state has been changed to populate the transaction with the current route.
   */
  // oxlint-disable-next-line eslint(complexity)
  const updateLatestNavigationSpanWithCurrentRoute = (): void => {
    const stateChangedTimestamp = timestampInSeconds();
    const previousRoute = latestRoute;

    if (!navigationContainer) {
      debug.warn(`${INTEGRATION_NAME} Missing navigation container ref. Route transactions will not be sent.`);
      return undefined;
    }

    const route = navigationContainer.getCurrentRoute();
    if (!route) {
      debug.log(`[${INTEGRATION_NAME}] Navigation state changed, but no route is rendered.`);
      return undefined;
    }

    if (!latestNavigationSpan) {
      debug.log(
        `[${INTEGRATION_NAME}] Navigation state changed, but navigation transaction was not started on dispatch.`,
      );
      return undefined;
    }

    if (enableTimeToInitialDisplay) {
      addTimeToInitialDisplayFallback(latestNavigationSpan.spanContext().spanId, NATIVE.getNewScreenTimeToDisplay());
    }

    if (previousRoute?.key === route.key) {
      debug.log(`[${INTEGRATION_NAME}] Navigation state changed, but route is the same as previous.`);
      // Even a same-route state change is a legitimate destination for a
      // deep link (e.g. deep-linking to the screen you're already on). Make
      // sure the pending link still gets attributed before we drop the span
      // reference.
      const deepLinkAttached = applyPendingDeepLinkToSpan(latestNavigationSpan, routeChangeTimeoutMs);
      pushRecentRouteKey(route.key);
      latestRoute = route;

      // A POP_TO that landed on the route we were already on was a
      // params-only bookkeeping dispatch (e.g. Expo Router's `withAnchor`
      // anchor stamping) that slipped past the dispatch-time filter — for
      // example a nested destination whose payload name matches none of the
      // focused route names. Letting the span run would ship a spurious
      // duplicate transaction that collects the real navigation's in-flight
      // child spans, so discard it unless a deep link claimed it above.
      if (
        !deepLinkAttached &&
        spanToJSON(latestNavigationSpan).data?.[SEMANTIC_ATTRIBUTE_NAVIGATION_ACTION_TYPE] === 'POP_TO'
      ) {
        debug.log(`[${INTEGRATION_NAME}] Discarding POP_TO navigation span that did not change the route.`);
        clearStateChangeTimeout();
        _discardLatestTransaction();
        return undefined;
      }

      // Clear the latest transaction as it has been handled.
      latestNavigationSpan = undefined;
      return undefined;
    }

    const routeHasBeenSeen = recentRouteKeys.includes(route.key);

    // Resolve route name. Order of preference:
    //   1. Route override provider (e.g. Expo Router templated path)
    //   2. Full path joined from React Navigation state
    //   3. React Navigation's leaf route name
    let routeName = route.name;
    let routePath: string | undefined;
    let routeUrl: string | undefined;
    let routeParams: Record<string, unknown> | undefined = route.params;

    let override: RouteOverride | undefined;
    try {
      override = routeOverrideProvider?.();
    } catch (e) {
      debug.warn(`${INTEGRATION_NAME} Route override provider threw, falling back to React Navigation route.`, e);
    }

    if (override?.templatedPath) {
      routeName = override.templatedPath;
      routePath = override.templatedPath;
      routeUrl = override.concreteUrl;
      routeParams = override.params ?? route.params;
    } else if (useFullPathsForNavigationRoutes) {
      const navigationState = navigationContainer.getState();
      routeName = getPathFromState(navigationState) || route.name;
    }

    // Consume any pending deep link and attach it to this span. Done here
    // (after route info is known) so the link is only attributed to a span
    // that actually mounted a route — not one that was later discarded.
    applyPendingDeepLinkToSpan(latestNavigationSpan, routeChangeTimeoutMs);

    // Capture the first finalized nav span for the cold-start late-arrival
    // fallback. Set exactly once, then frozen — a cold-start link must never
    // retroactively tag a navigation the user performed later.
    if (!initialFinalizedNavSpan) {
      initialFinalizedNavSpan = latestNavigationSpan;
    }

    navigationProcessingSpan?.updateName(`Navigation dispatch to screen ${routeName} mounted`);
    navigationProcessingSpan?.setStatus({ code: SPAN_STATUS_OK });
    navigationProcessingSpan?.end(stateChangedTimestamp);
    navigationProcessingSpan = undefined;

    if (!latestNavigationSpanNameCustomized) {
      latestNavigationSpan.updateName(routeName);
    }
    const sendDefaultPii = getClient()?.getOptions()?.sendDefaultPii ?? false;
    latestNavigationSpan.setAttributes({
      'route.name': routeName,
      'route.key': route.key,
      ...(routePath ? { 'route.path': routePath } : undefined),
      ...(sendDefaultPii && routeUrl ? { 'route.url': routeUrl } : undefined),
      ...(sendDefaultPii ? extractDynamicRouteParams(routeName, routeParams) : undefined),
      'route.has_been_seen': routeHasBeenSeen,
      'previous_route.name': previousRoute?.name,
      'previous_route.key': previousRoute?.key,
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
    });

    // Clear the timeout so the transaction does not get cancelled.
    clearStateChangeTimeout();

    addBreadcrumb({
      category: 'navigation',
      type: 'navigation',
      message: `Navigation to ${routeName}`,
      data: {
        from: previousRoute?.name,
        to: routeName,
      },
    });

    tracing?.setCurrentRoute(routeName);

    pushRecentRouteKey(route.key);
    if (override?.templatedPath || useFullPathsForNavigationRoutes) {
      latestRoute = { ...route, name: routeName };
    } else {
      latestRoute = route;
    }
    // Clear the latest transaction as it has been handled.
    latestNavigationSpan = undefined;
  };

  /** Pushes a recent route key, and removes earlier routes when there is greater than the max length */
  const pushRecentRouteKey = (key: string): void => {
    recentRouteKeys.push(key);

    if (recentRouteKeys.length > NAVIGATION_HISTORY_MAX_SIZE) {
      recentRouteKeys = recentRouteKeys.slice(recentRouteKeys.length - NAVIGATION_HISTORY_MAX_SIZE);
    }
  };

  /** Cancels the latest transaction so it does not get sent to Sentry. */
  const _discardLatestTransaction = (): void => {
    if (latestNavigationSpan) {
      if (isSentrySpan(latestNavigationSpan)) {
        markRootSpanForDiscard(latestNavigationSpan, 'discarded_latest_navigation');
      }
      // TODO: What if it's not SentrySpan?
      latestNavigationSpan.end();
      latestNavigationSpan = undefined;
    }
    if (navigationProcessingSpan) {
      navigationProcessingSpan = undefined;
    }
  };

  const clearStateChangeTimeout = (): void => {
    if (typeof stateChangeTimeout !== 'undefined') {
      clearTimeout(stateChangeTimeout);
      stateChangeTimeout = undefined;
    }
  };

  const _setRouteOverrideProvider = (provider: RouteOverrideProvider | undefined): void => {
    routeOverrideProvider = provider;
  };

  return {
    name: INTEGRATION_NAME,
    afterAllSetup,
    registerNavigationContainer,
    _setRouteOverrideProvider,
    options: {
      routeChangeTimeoutMs,
      enableTimeToInitialDisplay,
      ignoreEmptyBackNavigationTransactions,
      enableTimeToInitialDisplayForPreloadedRoutes,
      useDispatchedActionData,
      useFullPathsForNavigationRoutes,
      enablePrefetchTracking,
    },
  };
};

export interface NavigationRoute {
  name: string;
  key: string;
  // oxlint-disable-next-line typescript-eslint(no-explicit-any)
  params?: Record<string, any>;
  state?: NavigationState;
}

interface NavigationState {
  index?: number;
  routes: NavigationRoute[];
}

interface NavigationContainer {
  addListener: (type: string, listener: (event?: unknown) => void) => void;
  getCurrentRoute: () => NavigationRoute;
  getState: () => NavigationState | undefined;
}

/**
 * Per-span guard against double-tagging deep-link attributes. Shared between
 * the synchronous listener path (late arrival) and the post-state-change path.
 */
const taggedDeepLinkSpans = new WeakSet<Span>();

/**
 * Annotates the given span with deep-link attributes if it has not already
 * been annotated. Returns `true` when the span was newly tagged, `false` when
 * it was already tagged (so callers can decide whether to keep the link
 * around for another span).
 */
function tagSpanWithDeepLink(span: Span, link: PendingDeepLink): boolean {
  if (taggedDeepLinkSpans.has(span)) {
    return false;
  }
  taggedDeepLinkSpans.add(span);

  const sendDefaultPii = getClient()?.getOptions()?.sendDefaultPii ?? false;
  const url = sendDefaultPii ? link.url : sanitizeDeepLinkUrl(link.url);

  span.setAttributes({
    'navigation.trigger': 'deeplink',
    'deeplink.url': url,
    // Duration between URL receipt and the moment the span is annotated —
    // approximates the gap between "link received" and "navigation dispatched
    // / handled".
    'deeplink.dispatch_delay_ms': Math.max(0, Date.now() - link.receivedAtMs),
  });
  return true;
}

/** Returns true if the span is still recording (has not been ended). */
function isSpanRecording(span: Span): boolean {
  return spanToJSON(span).timestamp === undefined;
}

/**
 * Extracts the route name from a React Navigation dispatch action payload.
 *
 * Actions like NAVIGATE, PUSH, REPLACE, JUMP_TO carry the target route name
 * in `action.payload.name`. Actions like GO_BACK, POP, POP_TO_TOP do not.
 */
function getRouteNameFromAction(event: UnsafeAction | undefined): string | undefined {
  const payload = event?.data?.action?.payload;
  if (payload && typeof payload === 'object' && 'name' in payload && typeof payload.name === 'string') {
    return payload.name;
  }
  return undefined;
}

/**
 * Returns React Navigation integration of the given client.
 */
export function getReactNavigationIntegration(
  client: Client,
): ReturnType<typeof reactNavigationIntegration> | undefined {
  return client.getIntegrationByName<ReturnType<typeof reactNavigationIntegration>>(INTEGRATION_NAME);
}
