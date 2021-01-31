import { Transaction } from "@sentry/types";
import { logger } from "@sentry/utils";

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

interface AppContainerRef {
  current?: AppContainerInstance | null;
}

/**
 * Instrumentation for React-Navigation V4.
 * Register the app container with `registerAppContainer` to use, or see docs for more details.
 */
class ReactNavigationV4Instrumentation extends RoutingInstrumentation {
  static instrumentationName: string = "react-navigation-v4";

  private _appContainerRef: AppContainerRef = { current: null };

  private readonly _maxRecentRouteLen: number = 200;

  private _prevRoute?: NavigationRouteV4;
  private _recentRouteKeys: string[] = [];

  private _latestTransaction?: Transaction;
  private _shouldUpdateLatestTransaction: boolean = false;

  /**
   * Extends by calling _handleInitialState at the end.
   */
  public registerRoutingInstrumentation(
    listener: TransactionCreator,
    beforeNavigate: BeforeNavigate
  ): void {
    super.registerRoutingInstrumentation(listener, beforeNavigate);

    // Need to handle the initial state as the router patch will only attach transactions on subsequent route changes.
    this._handleInitialState();
  }

  /**
   * Pass the ref to the app container to register it to the instrumentation
   * @param appContainerRef Ref to an `AppContainer`
   */
  public registerAppContainer(
    appContainerRef: AppContainerRef | AppContainerInstance
  ): void {
    if ("current" in appContainerRef) {
      this._appContainerRef = appContainerRef;
    } else {
      this._appContainerRef = {
        current: appContainerRef as AppContainerInstance,
      };
    }

    if (!this._appContainerRef?.current) {
      logger.error(
        "[ReactNavigationV4Instrumentation]: App container ref is incorrect, instrumentation will not attach."
      );
    } else {
      this._patchRouter();

      if (this._shouldUpdateLatestTransaction) {
        this._updateLatestTransaction();
        this._shouldUpdateLatestTransaction = false;
      }
    }
  }

  /**
   * Starts an idle transaction for the initial state which won't get called by the router listener.
   */
  private _handleInitialState(): void {
    this._latestTransaction = this.onRouteWillChange(
      BLANK_TRANSACTION_CONTEXT_V4
    );

    // We set this to true so when registerAppContainer is called, the transaction gets updated with the actual route data
    this._shouldUpdateLatestTransaction = true;
  }

  /**
   * Updates the latest transaction with the current state and calls beforeNavigate.
   */
  private _updateLatestTransaction(): void {
    // We can assume the ref is present as this is called from registerAppContainer
    if (this._appContainerRef.current && this._latestTransaction) {
      const state = this._appContainerRef.current._navigation.state;
      this._onStateChange(state, true);
    }
  }

  /**
   * Patches the react navigation router so we can listen to the route changes and attach the `IdleTransaction` before the
   * new screen is mounted.
   */
  private _patchRouter(): void {
    if (this._appContainerRef.current) {
      const originalGetStateForAction = this._appContainerRef.current
        ._navigation.router.getStateForAction;

      this._appContainerRef.current._navigation.router.getStateForAction = (
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
      let finalContext = this._beforeNavigate?.(originalContext);

      // This block is to catch users not returning a transaction context
      if (!finalContext) {
        logger.error(
          `[ReactNavigationV4Instrumentation] beforeNavigate returned ${finalContext}, return context.sampled = false to not send transaction.`
        );

        finalContext = {
          ...originalContext,
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
}

const BLANK_TRANSACTION_CONTEXT_V4 = {
  name: "Route Change",
  op: "navigation",
  tags: {
    "routing.instrumentation":
      ReactNavigationV4Instrumentation.instrumentationName,
  },
  data: {},
};

export { ReactNavigationV4Instrumentation, BLANK_TRANSACTION_CONTEXT_V4 };
