/* eslint-disable max-lines */
import type { Client, Integration, Span } from '@sentry/core';
import {
  addBreadcrumb,
  getClient,
  isPlainObject,
  logger,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_OK,
  spanToJSON,
  startInactiveSpan,
  timestampInSeconds,
} from '@sentry/core';

import { getAppRegistryIntegration } from '../integrations/appRegistry';
import { isSentrySpan } from '../utils/span';
import { RN_GLOBAL_OBJ } from '../utils/worldwide';
import type { UnsafeAction } from '../vendor/react-navigation/types';
import { NATIVE } from '../wrapper';
import { ignoreEmptyBackNavigation } from './onSpanEndUtils';
import { SPAN_ORIGIN_AUTO_NAVIGATION_REACT_NAVIGATION } from './origin';
import type { ReactNativeTracingIntegration } from './reactnativetracing';
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
}: Partial<ReactNavigationIntegrationOptions> = {}): Integration & {
  /**
   * Pass the ref to the navigation container to register it to the instrumentation
   * @param navigationContainerRef Ref to a `NavigationContainer`
   */
  registerNavigationContainer: (navigationContainerRef: unknown) => void;
  options: ReactNavigationIntegrationOptions;
} => {
  let navigationContainer: NavigationContainer | undefined;

  let tracing: ReactNativeTracingIntegration | undefined;
  let idleSpanOptions: Parameters<typeof startGenericIdleNavigationSpan>[1] = defaultIdleOptions;
  let latestRoute: NavigationRoute | undefined;

  let latestNavigationSpan: Span | undefined;
  let navigationProcessingSpan: Span | undefined;

  let initialStateHandled: boolean = false;
  let stateChangeTimeout: ReturnType<typeof setTimeout> | undefined;
  let recentRouteKeys: string[] = [];

  if (enableTimeToInitialDisplay) {
    NATIVE.initNativeReactNavigationNewFrameTracking().catch((reason: unknown) => {
      logger.error(`${INTEGRATION_NAME} Failed to initialize native new frame tracking: ${reason}`);
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
        logger.log('[ReactNavigationIntegration] Starting new idle navigation span based on runApplication call.');
        startIdleNavigationSpan();
      }
    });

    startIdleNavigationSpan();

    if (!navigationContainer) {
      // This is expected as navigation container is registered after the root component is mounted.
      return undefined;
    }

    // Navigation container already registered, just populate with route state
    updateLatestNavigationSpanWithCurrentRoute();
    initialStateHandled = true;
  };

  const registerNavigationContainer = (maybeNewNavigationContainer: unknown): void => {
    if (RN_GLOBAL_OBJ.__sentry_rn_v5_registered) {
      logger.debug(`${INTEGRATION_NAME} Instrumentation already exists, but registering again...`);
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
      logger.log(`${INTEGRATION_NAME} Navigation container ref is the same as the one already registered.`);
      return;
    }
    navigationContainer = newNavigationContainer as NavigationContainer;

    if (!navigationContainer) {
      logger.warn(`${INTEGRATION_NAME} Received invalid navigation container ref!`);
      return undefined;
    }

    // This action is emitted on every dispatch
    navigationContainer.addListener('__unsafe_action__', startIdleNavigationSpan);
    navigationContainer.addListener('state', updateLatestNavigationSpanWithCurrentRoute);
    RN_GLOBAL_OBJ.__sentry_rn_v5_registered = true;

    if (initialStateHandled) {
      return undefined;
    }

    if (!latestNavigationSpan) {
      logger.log(`${INTEGRATION_NAME} Navigation container registered, but integration has not been setup yet.`);
      return undefined;
    }

    // Navigation Container is registered after the first navigation
    // Initial navigation span was started, after integration setup,
    // so now we populate it with the current route.
    updateLatestNavigationSpanWithCurrentRoute();
    initialStateHandled = true;
  };

  /**
   * To be called on every React-Navigation action dispatch.
   * It does not name the transaction or populate it with route information. Instead, it waits for the state to fully change
   * and gets the route information from there, @see updateLatestNavigationSpanWithCurrentRoute
   */
  const startIdleNavigationSpan = (unknownEvent?: unknown): void => {
    const event = unknownEvent as UnsafeAction | undefined;
    if (useDispatchedActionData && event?.data.noop) {
      logger.debug(`${INTEGRATION_NAME} Navigation action is a noop, not starting navigation span.`);
      return;
    }

    const navigationActionType = useDispatchedActionData ? event?.data.action.type : undefined;
    if (
      useDispatchedActionData &&
      [
        // Process common actions
        'PRELOAD',
        'SET_PARAMS',
        // Drawer actions
        'OPEN_DRAWER',
        'CLOSE_DRAWER',
        'TOGGLE_DRAWER',
      ].includes(navigationActionType)
    ) {
      logger.debug(`${INTEGRATION_NAME} Navigation action is ${navigationActionType}, not starting navigation span.`);
      return;
    }

    if (latestNavigationSpan) {
      logger.log(`${INTEGRATION_NAME} A transaction was detected that turned out to be a noop, discarding.`);
      _discardLatestTransaction();
      clearStateChangeTimeout();
    }

    latestNavigationSpan = startGenericIdleNavigationSpan(
      tracing && tracing.options.beforeStartSpan
        ? tracing.options.beforeStartSpan(getDefaultIdleNavigationSpanOptions())
        : getDefaultIdleNavigationSpanOptions(),
      idleSpanOptions,
    );
    latestNavigationSpan?.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SPAN_ORIGIN_AUTO_NAVIGATION_REACT_NAVIGATION);
    latestNavigationSpan?.setAttribute(SEMANTIC_ATTRIBUTE_NAVIGATION_ACTION_TYPE, navigationActionType);
    if (ignoreEmptyBackNavigationTransactions) {
      ignoreEmptyBackNavigation(getClient(), latestNavigationSpan);
    }

    if (enableTimeToInitialDisplay) {
      NATIVE.setActiveSpanId(latestNavigationSpan?.spanContext().spanId);
      navigationProcessingSpan = startInactiveSpan({
        op: 'navigation.processing',
        name: 'Navigation dispatch to navigation cancelled or screen mounted',
        startTime: latestNavigationSpan && spanToJSON(latestNavigationSpan).start_timestamp,
      });
      navigationProcessingSpan.setAttribute(
        SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
        SPAN_ORIGIN_AUTO_NAVIGATION_REACT_NAVIGATION,
      );
    }

    stateChangeTimeout = setTimeout(_discardLatestTransaction, routeChangeTimeoutMs);
  };

  /**
   * To be called AFTER the state has been changed to populate the transaction with the current route.
   */
  const updateLatestNavigationSpanWithCurrentRoute = (): void => {
    const stateChangedTimestamp = timestampInSeconds();
    const previousRoute = latestRoute;

    if (!navigationContainer) {
      logger.warn(`${INTEGRATION_NAME} Missing navigation container ref. Route transactions will not be sent.`);
      return undefined;
    }

    const route = navigationContainer.getCurrentRoute();
    if (!route) {
      logger.debug(`[${INTEGRATION_NAME}] Navigation state changed, but no route is rendered.`);
      return undefined;
    }

    if (!latestNavigationSpan) {
      logger.debug(
        `[${INTEGRATION_NAME}] Navigation state changed, but navigation transaction was not started on dispatch.`,
      );
      return undefined;
    }

    addTimeToInitialDisplayFallback(latestNavigationSpan.spanContext().spanId, NATIVE.getNewScreenTimeToDisplay());

    if (previousRoute && previousRoute.key === route.key) {
      logger.debug(`[${INTEGRATION_NAME}] Navigation state changed, but route is the same as previous.`);
      pushRecentRouteKey(route.key);
      latestRoute = route;

      // Clear the latest transaction as it has been handled.
      latestNavigationSpan = undefined;
      return undefined;
    }

    const routeHasBeenSeen = recentRouteKeys.includes(route.key);

    navigationProcessingSpan?.updateName(`Navigation dispatch to screen ${route.name} mounted`);
    navigationProcessingSpan?.setStatus({ code: SPAN_STATUS_OK });
    navigationProcessingSpan?.end(stateChangedTimestamp);
    navigationProcessingSpan = undefined;

    if (spanToJSON(latestNavigationSpan).description === DEFAULT_NAVIGATION_SPAN_NAME) {
      latestNavigationSpan.updateName(route.name);
    }
    latestNavigationSpan.setAttributes({
      'route.name': route.name,
      'route.key': route.key,
      // TODO: filter PII params instead of dropping them all
      // 'route.params': {},
      'route.has_been_seen': routeHasBeenSeen,
      'previous_route.name': previousRoute?.name,
      'previous_route.key': previousRoute?.key,
      // TODO: filter PII params instead of dropping them all
      // 'previous_route.params': {},
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
    });

    // Clear the timeout so the transaction does not get cancelled.
    clearStateChangeTimeout();

    addBreadcrumb({
      category: 'navigation',
      type: 'navigation',
      message: `Navigation to ${route.name}`,
      data: {
        from: previousRoute?.name,
        to: route.name,
      },
    });

    tracing?.setCurrentRoute(route.name);

    pushRecentRouteKey(route.key);
    latestRoute = route;
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
        latestNavigationSpan['_sampled'] = false;
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

  return {
    name: INTEGRATION_NAME,
    afterAllSetup,
    registerNavigationContainer,
    options: {
      routeChangeTimeoutMs,
      enableTimeToInitialDisplay,
      ignoreEmptyBackNavigationTransactions,
      enableTimeToInitialDisplayForPreloadedRoutes,
      useDispatchedActionData,
    },
  };
};

export interface NavigationRoute {
  name: string;
  key: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: Record<string, any>;
}

interface NavigationContainer {
  addListener: (type: string, listener: (event?: unknown) => void) => void;
  getCurrentRoute: () => NavigationRoute;
}

/**
 * Returns React Navigation integration of the given client.
 */
export function getReactNavigationIntegration(
  client: Client,
): ReturnType<typeof reactNavigationIntegration> | undefined {
  return client.getIntegrationByName<ReturnType<typeof reactNavigationIntegration>>(INTEGRATION_NAME);
}
