import {
  Transaction as TransactionType,
  TransactionContext,
} from "@sentry/types";
import { logger } from "@sentry/utils";

import { RoutingInstrumentation } from "./routingInstrumentation";

export interface NavigationRouteV5 {
  name: string;
  key: string;
  params?: Record<any, any>;
}

interface NavigationContainerV5 {
  addListener: (type: string, listener: () => void) => void;
  getCurrentRoute: () => NavigationRouteV5;
}

type NavigationContainerV5Ref = {
  current: NavigationContainerV5 | null;
};

const STATE_CHANGE_TIMEOUT_DURATION = 200;

/**
 * Instrumentation for React-Navigation V5. See docs or sample app for usage.
 *
 * How this works:
 * - `_onDispatch` is called every time a dispatch happens and sets an IdleTransaction on the scope without any route context.
 * - `_onStateChange` is then called AFTER the state change happens due to a dispatch and sets the route context onto the active transaction.
 * - If `_onStateChange` isn't called within `STATE_CHANGE_TIMEOUT_DURATION` of the dispatch, then the transaction is not sampled and finished.
 */
export class ReactNavigationV5Instrumentation extends RoutingInstrumentation {
  static instrumentationName: string = "react-navigation-v5";

  private _navigationContainerRef: NavigationContainerV5Ref = {
    current: null,
  };

  private readonly _maxRecentRouteLen: number = 200;

  private _latestRoute?: NavigationRouteV5;
  private _latestTransaction?: TransactionType;
  private _stateChangeTimeout?: number | undefined;
  private _recentRouteKeys: string[] = [];

  /**
   * Pass the ref to the navigation container to register it to the instrumentation
   * @param navigationContainerRef Ref to a `NavigationContainer`
   */
  public registerNavigationContainer(
    navigationContainerRef: NavigationContainerV5Ref
  ): void {
    this._navigationContainerRef = navigationContainerRef;
    navigationContainerRef.current?.addListener(
      "__unsafe_action__", // This action is emitted on every dispatch
      this._onDispatch.bind(this)
    );
    navigationContainerRef.current?.addListener(
      "state", // This action is emitted on every state change
      this._onStateChange.bind(this)
    );

    // This will set a transaction for the initial screen.
    this._onDispatch();
    this._onStateChange();
  }

  /**
   * To be called on every React-Navigation action dispatch.
   * It does not name the transaction or populate it with route information. Instead, it waits for the state to fully change
   * and gets the route information from there, @see _onStateChange
   */
  private _onDispatch(): void {
    this._latestTransaction = this.onRouteWillChange(BLANK_TRANSACTION_CONTEXT);

    this._stateChangeTimeout = setTimeout(
      this._discardLatestTransaction.bind(this),
      STATE_CHANGE_TIMEOUT_DURATION
    );
  }

  /**
   * To be called AFTER the state has been changed to populate the transaction with the current route.
   */
  private _onStateChange(): void {
    // Use the getCurrentRoute method to be accurate.
    const previousRoute = this._latestRoute;
    const route = this._navigationContainerRef?.current?.getCurrentRoute();

    if (route) {
      if (
        this._latestTransaction &&
        (!previousRoute || previousRoute.key !== route.key)
      ) {
        const originalContext = this._latestTransaction.toContext();
        const routeHasBeenSeen = this._recentRouteKeys.includes(route.key);

        const updatedContext = {
          ...originalContext,
          name: route.name,
          tags: {
            ...originalContext.tags,
            "routing.route.name": route.name,
          },
          data: {
            ...originalContext.data,
            route: {
              name: route.name,
              key: route.key,
              params: route.params ?? {},
              hasBeenSeen: routeHasBeenSeen,
            },
            previousRoute: previousRoute
              ? {
                  name: previousRoute.name,
                  key: previousRoute.key,
                  params: previousRoute.params ?? {},
                }
              : null,
          },
        };

        const finalContext =
          this._beforeNavigate?.(updatedContext) ?? updatedContext;

        if (finalContext.sampled) {
          // Clear the timeout so the transaction does not get cancelled.
          if (typeof this._stateChangeTimeout !== "undefined") {
            clearTimeout(this._stateChangeTimeout);
            this._stateChangeTimeout = undefined;
          }
        } else {
          logger.log(
            `[ReactNavigationV5Instrumentation] Will not send transaction "${this._latestTransaction.name}" due to shouldSendTransaction.`
          );
        }

        this._latestTransaction.updateWithContext(finalContext);
      }

      this._pushRecentRouteKey(route.key);
      this._latestRoute = route;
    }
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

  /** Cancels the latest transaction so it does not get sent to Sentry. */
  private _discardLatestTransaction(): void {
    if (this._latestTransaction) {
      this._latestTransaction.sampled = false;
      this._latestTransaction.finish();
      this._latestTransaction = undefined;
    }
  }
}

export const BLANK_TRANSACTION_CONTEXT = {
  name: "Route Change",
  op: "navigation",
  tags: {
    "routing.instrumentation":
      ReactNavigationV5Instrumentation.instrumentationName,
  },
};
