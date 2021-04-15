/* eslint-disable max-lines */
import { Transaction } from "@sentry/types";
import { getGlobalObject, logger } from "@sentry/utils";

import { BeforeNavigate } from "./reactnativetracing";
import {
  RoutingInstrumentation,
  TransactionCreator,
} from "./routingInstrumentation";
import { ReactNavigationTransactionContext } from "./types";

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
        state: NavigationStateV4
      ) => NavigationStateV4;
    };
  };
}

interface ReactNavigationV4Options {
  /**
   * The time the transaction will wait for route to mount before it is discarded.
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
class ReactNavigationV4Instrumentation extends RoutingInstrumentation {
  static instrumentationName: string = "react-navigation-v4";

  private _appContainer: AppContainerInstance | null = null;

  private readonly _maxRecentRouteLen: number = 200;

  private _prevRoute?: NavigationRouteV4;
  private _recentRouteKeys: string[] = [];

  private _latestTransaction?: Transaction;
  private _initialStateHandled: boolean = false;
  private _stateChangeTimeout?: number | undefined;

  private _options: ReactNavigationV4Options;

  constructor(options: Partial<ReactNavigationV4Options> = {}) {
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
    beforeNavigate: BeforeNavigate
  ): void {
    super.registerRoutingInstrumentation(listener, beforeNavigate);

    // Need to handle the initial state as the router patch will only attach transactions on subsequent route changes.
    if (!this._initialStateHandled) {
      this._latestTransaction = this.onRouteWillChange(
        INITIAL_TRANSACTION_CONTEXT_V4
      );
      if (this._appContainer) {
        this._updateLatestTransaction();

        this._initialStateHandled = true;
      } else {
        this._stateChangeTimeout = setTimeout(
          this._discardLatestTransaction.bind(this),
          this._options.routeChangeTimeoutMs
        );
      }
    }
  }

  /**
   * Pass the ref to the app container to register it to the instrumentation
   * @param appContainerRef Ref to an `AppContainer`
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public registerAppContainer(appContainerRef: any): void {
    const _global = getGlobalObject<{ __sentry_rn_v4_registered?: boolean }>();

    /* We prevent duplicate routing instrumentation to be initialized on fast refreshes

      Explanation: If the user triggers a fast refresh on the file that the instrumentation is
      initialized in, it will initialize a new instance and will cause undefined behavior.
     */
    if (!_global.__sentry_rn_v4_registered) {
      if ("current" in appContainerRef) {
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
              "[ReactNavigationV4Instrumentation] App container registered, but integration has not been setup yet."
            );
          }
          this._initialStateHandled = true;
        }

        _global.__sentry_rn_v4_registered = true;
      } else {
        logger.warn(
          "[ReactNavigationV4Instrumentation] Received invalid app container ref!"
        );
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

      if (typeof this._stateChangeTimeout !== "undefined") {
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
      const originalGetStateForAction = this._appContainer._navigation.router
        .getStateForAction;

      this._appContainer._navigation.router.getStateForAction = (
        action,
        state
      ) => {
        const newState = originalGetStateForAction(action, state);

        this._onStateChange(newState);

        return newState;
      };
    }
  }

  /**
   * To be called on navigation state changes and creates the transaction.
   */
  private _onStateChange(
    state: NavigationStateV4,
    updateLatestTransaction: boolean = false
  ): void {
    const currentRoute = this._getCurrentRouteFromState(state);

    // If the route is a different key, this is so we ignore actions that pertain to the same screen.
    if (!this._prevRoute || currentRoute.key !== this._prevRoute.key) {
      const originalContext = this._getTransactionContext(
        currentRoute,
        this._prevRoute
      );

      let mergedContext = originalContext;
      if (updateLatestTransaction && this._latestTransaction) {
        mergedContext = {
          ...this._latestTransaction.toContext(),
          ...originalContext,
        };
      }

      let finalContext = this._beforeNavigate?.(mergedContext);

      // This block is to catch users not returning a transaction context
      if (!finalContext) {
        logger.error(
          `[ReactNavigationV4Instrumentation] beforeNavigate returned ${finalContext}, return context.sampled = false to not send transaction.`
        );

        finalContext = {
          ...mergedContext,
          sampled: false,
        };
      }

      if (finalContext.sampled === false) {
        this._onBeforeNavigateNotSampled(finalContext.name);
      }

      if (updateLatestTransaction && this._latestTransaction) {
        // Update the latest transaction instead of calling onRouteWillChange
        this._latestTransaction.updateWithContext(finalContext);
      } else {
        this._latestTransaction = this.onRouteWillChange(finalContext);
      }

      this._pushRecentRouteKey(currentRoute.key);
      this._prevRoute = currentRoute;
    }
  }

  /**
   * Gets the transaction context for a `NavigationRouteV4`
   */
  private _getTransactionContext(
    route: NavigationRouteV4,
    previousRoute?: NavigationRouteV4
  ): ReactNavigationTransactionContext {
    return {
      name: route.routeName,
      op: "navigation",
      tags: {
        "routing.instrumentation":
          ReactNavigationV4Instrumentation.instrumentationName,
        "routing.route.name": route.routeName,
      },
      data: {
        route: {
          name: route.routeName, // Include name here too for use in `beforeNavigate`
          key: route.key,
          params: route.params ?? {},
          hasBeenSeen: this._recentRouteKeys.includes(route.key),
        },
        previousRoute: previousRoute
          ? {
              name: previousRoute.routeName,
              key: previousRoute.key,
              params: previousRoute.params ?? {},
            }
          : null,
      },
    };
  }

  /**
   * Gets the current route given a navigation state
   */
  private _getCurrentRouteFromState(
    state: NavigationStateV4
  ): NavigationRouteV4 {
    const parentRoute = state.routes[state.index];

    if (
      "index" in parentRoute &&
      "routes" in parentRoute &&
      typeof parentRoute.index === "number" &&
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
      this._recentRouteKeys = this._recentRouteKeys.slice(
        this._recentRouteKeys.length - this._maxRecentRouteLen
      );
    }
  };

  /** Helper to log a transaction that was not sampled due to beforeNavigate */
  private _onBeforeNavigateNotSampled = (transactionName: string): void => {
    logger.log(
      `[ReactNavigationV4Instrumentation] Will not send transaction "${transactionName}" due to beforeNavigate.`
    );
  };

  /** Cancels the latest transaction so it does not get sent to Sentry. */
  private _discardLatestTransaction(): void {
    if (this._latestTransaction) {
      this._latestTransaction.sampled = false;
      this._latestTransaction.finish();
      this._latestTransaction = undefined;
    }
  }
}

const INITIAL_TRANSACTION_CONTEXT_V4 = {
  name: "App Launch",
  op: "navigation",
  tags: {
    "routing.instrumentation":
      ReactNavigationV4Instrumentation.instrumentationName,
  },
  data: {},
};

export { ReactNavigationV4Instrumentation, INITIAL_TRANSACTION_CONTEXT_V4 };
