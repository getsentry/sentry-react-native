import type { Client, Integration, Span } from '@sentry/core';
import {
  addBreadcrumb,
  getClient,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  spanToJSON,
} from '@sentry/core';

import type { EmitterSubscription } from '../utils/rnlibrariesinterface';
import { isSentrySpan } from '../utils/span';
import { ignoreEmptyBackNavigation } from './onSpanEndUtils';
import { SPAN_ORIGIN_AUTO_NAVIGATION_REACT_NATIVE_NAVIGATION } from './origin';
import type { ReactNativeTracingIntegration } from './reactnativetracing';
import { getReactNativeTracingIntegration } from './reactnativetracing';
import {
  DEFAULT_NAVIGATION_SPAN_NAME,
  defaultIdleOptions,
  getDefaultIdleNavigationSpanOptions,
  startIdleNavigationSpan as startGenericIdleNavigationSpan,
} from './span';

export const INTEGRATION_NAME = 'ReactNativeNavigation';

const NAVIGATION_HISTORY_MAX_SIZE = 200;

interface ReactNativeNavigationOptions {
  /**
   * How long the instrumentation will wait for the route to mount after a change has been initiated,
   * before the transaction is discarded.
   *
   * @default 1_000 (ms)
   */
  routeChangeTimeoutMs?: number;

  /**
   * Instrumentation will create a transaction on tab change.
   * By default only navigation commands create transactions.
   *
   * @default false
   */
  enableTabsInstrumentation?: boolean;

  /**
   * Does not sample transactions that are from routes that have been seen any more and don't have any spans.
   * This removes a lot of the clutter as most back navigation transactions are now ignored.
   *
   * @default true
   */
  ignoreEmptyBackNavigationTransactions?: boolean;

  /** The React Native Navigation `NavigationDelegate`.
   *
   * ```js
   * import { Navigation } from 'react-native-navigation';
   * ```
   */
  navigation: unknown;
}

interface ComponentEvent {
  componentId: string;
}

type ComponentType = 'Component' | 'TopBarTitle' | 'TopBarBackground' | 'TopBarButton';

export interface ComponentWillAppearEvent extends ComponentEvent {
  componentName: string;
  passProps?: Record<string | number | symbol, unknown>;
  componentType: ComponentType;
}

export interface EventSubscription {
  remove(): void;
}

export interface BottomTabPressedEvent {
  tabIndex: number;
}

export interface EventsRegistry {
  registerComponentWillAppearListener(callback: (event: ComponentWillAppearEvent) => void): EmitterSubscription;
  registerCommandListener(callback: (name: string, params: unknown) => void): EventSubscription;
  registerBottomTabPressedListener(callback: (event: BottomTabPressedEvent) => void): EmitterSubscription;
}

export interface NavigationDelegate {
  events: () => EventsRegistry;
}

/**
 * Instrumentation for React Native Navigation. See docs or sample app for usage.
 *
 * How this works:
 * - `_onCommand` is called every time a commands happens and sets an IdleTransaction on the scope without any route context.
 * - `_onComponentWillAppear` is then called AFTER the state change happens due to a dispatch and sets the route context onto the active transaction.
 * - If `_onComponentWillAppear` isn't called within `options.routeChangeTimeoutMs` of the dispatch, then the transaction is not sampled and finished.
 */
export const reactNativeNavigationIntegration = ({
  navigation: optionsNavigation,
  routeChangeTimeoutMs = 1_000,
  enableTabsInstrumentation = false,
  ignoreEmptyBackNavigationTransactions = true,
}: ReactNativeNavigationOptions): Integration => {
  const navigation = optionsNavigation as NavigationDelegate;
  let recentComponentIds: string[] = [];

  let tracing: ReactNativeTracingIntegration | undefined;
  let idleSpanOptions: Parameters<typeof startGenericIdleNavigationSpan>[1] = defaultIdleOptions;

  let stateChangeTimeout: ReturnType<typeof setTimeout> | undefined;
  let prevComponentEvent: ComponentWillAppearEvent | null = null;
  let latestNavigationSpan: Span | undefined;

  const afterAllSetup = (client: Client): void => {
    tracing = getReactNativeTracingIntegration(client);
    if (tracing) {
      idleSpanOptions = {
        finalTimeout: tracing.options.finalTimeoutMs,
        idleTimeout: tracing.options.idleTimeoutMs,
      };
    }
  };

  const startIdleNavigationSpan = (): void => {
    if (latestNavigationSpan) {
      discardLatestNavigationSpan();
    }

    latestNavigationSpan = startGenericIdleNavigationSpan(
      tracing && tracing.options.beforeStartSpan
        ? tracing.options.beforeStartSpan(getDefaultIdleNavigationSpanOptions())
        : getDefaultIdleNavigationSpanOptions(),
      idleSpanOptions,
    );
    latestNavigationSpan?.setAttribute(
      SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
      SPAN_ORIGIN_AUTO_NAVIGATION_REACT_NATIVE_NAVIGATION,
    );
    if (ignoreEmptyBackNavigationTransactions) {
      ignoreEmptyBackNavigation(getClient(), latestNavigationSpan);
    }

    stateChangeTimeout = setTimeout(discardLatestNavigationSpan.bind(this), routeChangeTimeoutMs);
  };

  const updateLatestNavigationSpanWithCurrentComponent = (event: ComponentWillAppearEvent): void => {
    if (!latestNavigationSpan) {
      return;
    }

    // We ignore actions that pertain to the same screen.
    const isSameComponent = prevComponentEvent && event.componentId === prevComponentEvent.componentId;
    if (isSameComponent) {
      discardLatestNavigationSpan();
      return;
    }

    clearStateChangeTimeout();

    const routeHasBeenSeen = recentComponentIds.includes(event.componentId);

    if (spanToJSON(latestNavigationSpan).description === DEFAULT_NAVIGATION_SPAN_NAME) {
      latestNavigationSpan.updateName(event.componentName);
    }
    latestNavigationSpan.setAttributes({
      // TODO: Should we include pass props? I don't know exactly what it contains, cant find it in the RNavigation docs
      'route.name': event.componentName,
      'route.component_id': event.componentId,
      'route.component_type': event.componentType,
      'route.has_been_seen': routeHasBeenSeen,
      'previous_route.name': prevComponentEvent?.componentName,
      'previous_route.component_id': prevComponentEvent?.componentId,
      'previous_route.component_type': prevComponentEvent?.componentType,
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
    });

    tracing?.setCurrentRoute(event.componentName);

    addBreadcrumb({
      category: 'navigation',
      type: 'navigation',
      message: `Navigation to ${event.componentName}`,
      data: {
        from: prevComponentEvent?.componentName,
        to: event.componentName,
      },
    });

    pushRecentComponentId(event.componentId);
    prevComponentEvent = event;
    latestNavigationSpan = undefined;
  };

  navigation.events().registerCommandListener(startIdleNavigationSpan);
  if (enableTabsInstrumentation) {
    navigation.events().registerBottomTabPressedListener(startIdleNavigationSpan);
  }
  navigation.events().registerComponentWillAppearListener(updateLatestNavigationSpanWithCurrentComponent);

  const pushRecentComponentId = (id: string): void => {
    recentComponentIds.push(id);

    if (recentComponentIds.length > NAVIGATION_HISTORY_MAX_SIZE) {
      recentComponentIds = recentComponentIds.slice(recentComponentIds.length - NAVIGATION_HISTORY_MAX_SIZE);
    }
  };

  const discardLatestNavigationSpan = (): void => {
    if (latestNavigationSpan) {
      if (isSentrySpan(latestNavigationSpan)) {
        latestNavigationSpan['_sampled'] = false;
      }
      // TODO: What if it's not SentrySpan?
      latestNavigationSpan.end();
      latestNavigationSpan = undefined;
    }

    clearStateChangeTimeout();
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
  };
};
