/* eslint-disable max-lines */
import { SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';
import type { Span, TransactionContext } from '@sentry/types';
import { logger } from '@sentry/utils';

import { isSentrySpan } from '../utils/span';
import { RN_GLOBAL_OBJ } from '../utils/worldwide';
import type { OnConfirmRoute, TransactionCreator } from './routingInstrumentation';
import { InternalRoutingInstrumentation } from './routingInstrumentation';
import type { BeforeNavigate } from './types';

export interface NavigationRouteV4 {
  routeName: string;
  key: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: Record<string, any>;
}

export interface NavigationStateV4 {
  index: number;
  key: string;
  isTransitioning: boolean;
  routeName?: string;
  routes: (NavigationRouteV4 | NavigationStateV4)[];
}

export interface AppContainerInstance {
  _navigation: {
    state: NavigationStateV4;
    router: {
      getStateForAction: (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        action: any,
        state: NavigationStateV4,
      ) => NavigationStateV4;
    };
  };
}

interface ReactNavigationV4Options {
  /**
   * How long the instrumentation will wait for the route to mount after a change has been initiated,
   * before the transaction is discarded.
   * Time is in ms.
   *
   * Default: 1000
   */
  routeChangeTimeoutMs: number;
}

const defaultOptions: ReactNavigationV4Options = {
  routeChangeTimeoutMs: 1000,
};

/**
 * Instrumentation for React-Navigation V4.
 * Register the app container with `registerAppContainer` to use, or see docs for more details.
 */
class ReactNavigationV4Instrumentation extends InternalRoutingInstrumentation {
  public static instrumentationName: string = 'react-navigation-v4';

  public readonly name: string = ReactNavigationV4Instrumentation.instrumentationName;

  private _appContainer: AppContainerInstance | null = null;

  private readonly _maxRecentRouteLen: number = 200;

  private _prevRoute?: NavigationRouteV4;
  private _recentRouteKeys: string[] = [];

  private _latestTransaction?: Span;
  private _initialStateHandled: boolean = false;
  private _stateChangeTimeout?: number | undefined;

  private _options: ReactNavigationV4Options;

  public constructor(options: Partial<ReactNavigationV4Options> = {}) {
    super();

    this._options = {
      ...defaultOptions,
      ...options,
    };
  }

  /**
   * Extends by calling _handleInitialState at the end.
   */
  public registerRoutingInstrumentation(
    listener: TransactionCreator,
    beforeNavigate: BeforeNavigate,
    onConfirmRoute: OnConfirmRoute,
  ): void {
    super.registerRoutingInstrumentation(listener, beforeNavigate, onConfirmRoute);

    // Need to handle the initial state as the router patch will only attach transactions on subsequent route changes.
    if (!this._initialStateHandled) {
      this._latestTransaction = this.onRouteWillChange(INITIAL_TRANSACTION_CONTEXT_V4);
      if (this._appContainer) {
        this._updateLatestTransaction();

        this._initialStateHandled = true;
      } else {
        this._stateChangeTimeout = setTimeout(
          this._discardLatestTransaction.bind(this),
          this._options.routeChangeTimeoutMs,
        );
      }
    }
  }

  /**
   * Pass the ref to the app container to register it to the instrumentation
   * @param appContainerRef Ref to an `AppContainer`
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  public registerAppContainer(appContainerRef: any): void {
    /* We prevent duplicate routing instrumentation to be initialized on fast refreshes

      Explanation: If the user triggers a fast refresh on the file that the instrumentation is
      initialized in, it will initialize a new instance and will cause undefined behavior.
     */
    if (!RN_GLOBAL_OBJ.__sentry_rn_v4_registered) {
      if ('current' in appContainerRef) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        this._appContainer = appContainerRef.current;
      } else {
        this._appContainer = appContainerRef;
      }

      if (this._appContainer) {
        this._patchRouter();

        if (!this._initialStateHandled) {
          if (this._latestTransaction) {
            this._updateLatestTransaction();
          } else {
            logger.log(
              '[ReactNavigationV4Instrumentation] App container registered, but integration has not been setup yet.',
            );
          }
          this._initialStateHandled = true;
        }

        RN_GLOBAL_OBJ.__sentry_rn_v4_registered = true;
      } else {
        logger.warn('[ReactNavigationV4Instrumentation] Received invalid app container ref!');
      }
    }
  }

  /**
   * Updates the latest transaction with the current state and calls beforeNavigate.
   */
  private _updateLatestTransaction(): void {
    // We can assume the ref is present as this is called from registerAppContainer
    if (this._appContainer && this._latestTransaction) {
      const state = this._appContainer._navigation.state;

      if (typeof this._stateChangeTimeout !== 'undefined') {
        clearTimeout(this._stateChangeTimeout);
        this._stateChangeTimeout = undefined;
      }

      this._onStateChange(state, true);
    }
  }

  /**
   * Patches the react navigation router so we can listen to the route changes and attach the `IdleTransaction` before the
   * new screen is mounted.
   */
  private _patchRouter(): void {
    if (this._appContainer) {
      const originalGetStateForAction = this._appContainer._navigation.router.getStateForAction;

      this._appContainer._navigation.router.getStateForAction = (action, state) => {
        const newState = originalGetStateForAction(action, state);

        this._onStateChange(newState);

        return newState;
      };
    }
  }

  /**
   * To be called on navigation state changes and creates the transaction.
   */
  private _onStateChange(state: NavigationStateV4 | undefined, updateLatestTransaction: boolean = false): void {
    // it's not guaranteed that a state is always produced.
    // see: https://github.com/react-navigation/react-navigation/blob/45d419be93c34e900e8734ce98321ae875ac4997/packages/core/src/routers/SwitchRouter.js?rgh-link-date=2021-09-25T12%3A43%3A36Z#L301
    if (!state || state === undefined) {
      logger.warn('[ReactNavigationV4Instrumentation] onStateChange called without a valid state.');

      return;
    }

    const currentRoute = this._getCurrentRouteFromState(state);

    // If the route is a different key, this is so we ignore actions that pertain to the same screen.
    if (!this._prevRoute || currentRoute.key !== this._prevRoute.key) {
      if (updateLatestTransaction && this._latestTransaction) {
        this._latestTransaction.updateName(currentRoute.routeName);
        this._latestTransaction.setAttributes({
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'view',
          'routing.instrumentation': ReactNavigationV4Instrumentation.instrumentationName,
          'route.name': currentRoute.routeName,
          'route.key': currentRoute.key,
          // TODO: filter PII params instead of dropping them all
          // 'route.params': {},
          'route.has_been_seen': this._recentRouteKeys.includes(currentRoute.key),
          'previous_route.name': this._prevRoute?.routeName,
          'previous_route.key': this._prevRoute?.key,
          // TODO: filter PII params instead of dropping them all
          // 'previous_route.params': {},
        });

        // TODO: route name tag is replaces by event.contexts.app.view_names

        // TODO: Should we remove beforeNavigation callback or change it to be compatible with V8?
      } else {
        this._latestTransaction = this.onRouteWillChange({ name: currentRoute.routeName });
      }

      this._onConfirmRoute?.(currentRoute.routeName);

      this._pushRecentRouteKey(currentRoute.key);
      this._prevRoute = currentRoute;
    }
  }

  /**
   * Gets the current route given a navigation state
   */
  private _getCurrentRouteFromState(state: NavigationStateV4): NavigationRouteV4 {
    const parentRoute = state.routes[state.index];

    if (
      'index' in parentRoute &&
      'routes' in parentRoute &&
      typeof parentRoute.index === 'number' &&
      Array.isArray(parentRoute.routes)
    ) {
      return this._getCurrentRouteFromState(parentRoute);
    }

    return parentRoute as NavigationRouteV4;
  }

  /** Pushes a recent route key, and removes earlier routes when there is greater than the max length */
  private _pushRecentRouteKey = (key: string): void => {
    this._recentRouteKeys.push(key);

    if (this._recentRouteKeys.length > this._maxRecentRouteLen) {
      this._recentRouteKeys = this._recentRouteKeys.slice(this._recentRouteKeys.length - this._maxRecentRouteLen);
    }
  };

  /** Helper to log a transaction that was not sampled due to beforeNavigate */
  private _onBeforeNavigateNotSampled = (transactionName: string): void => {
    logger.log(
      `[ReactNavigationV4Instrumentation] Will not send transaction "${transactionName}" due to beforeNavigate.`,
    );
  };

  /** Cancels the latest transaction so it does not get sent to Sentry. */
  private _discardLatestTransaction(): void {
    if (this._latestTransaction) {
      if (isSentrySpan(this._latestTransaction)) {
        this._latestTransaction['_sampled'] = false;
      }
      // TODO: What if it's not SentrySpan?
      this._latestTransaction.end();
      this._latestTransaction = undefined;
    }
  }
}

const INITIAL_TRANSACTION_CONTEXT_V4: TransactionContext = {
  name: 'App Launch',
  op: 'navigation',
  data: {},
  metadata: {},
};

export { ReactNavigationV4Instrumentation, INITIAL_TRANSACTION_CONTEXT_V4 };
