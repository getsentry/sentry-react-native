import { TransactionContext } from "@sentry/types";
import { logger } from "@sentry/utils";

import { RoutingInstrumentation } from "./router";

interface NavigationRoute {
  routeName: string;
  key: string;
  params?: Record<any, any>;
}

interface NavigationState {
  index: number;
  key: string;
  isTransitioning: boolean;
  routeName?: string;
  routes: (NavigationRoute | NavigationState)[];
}

interface AppContainerInstance {
  _navigation: {
    state: NavigationState;
    router: {
      getStateForAction: (
        action: any,
        state: NavigationState
      ) => NavigationState;
    };
  };
}

interface AppContainerRef {
  current?: AppContainerInstance | null;
}

type ReactNavigationV4ShouldAttachTransaction = (
  prevRoute: NavigationRoute | null,
  newRoute: NavigationRoute
) => boolean;

interface ReactNavigationV4InstrumentationOptions {
  shouldAttachTransaction: ReactNavigationV4ShouldAttachTransaction;
}

const defaultShouldAttachTransaction: ReactNavigationV4ShouldAttachTransaction = () =>
  true;

const DEFAULT_OPTIONS: ReactNavigationV4InstrumentationOptions = {
  shouldAttachTransaction: defaultShouldAttachTransaction,
};

/**
 * Instrumentation for React-Navigation V4.
 * Register the app container with `registerAppContainer` to use, or see docs for more details.
 */
class ReactNavigationV4Instrumentation extends RoutingInstrumentation {
  static instrumentationName: string = "react-navigation-v4";

  private _appContainerRef: AppContainerRef = { current: null };

  private _options: ReactNavigationV4InstrumentationOptions;

  private _prevRoute: NavigationRoute | null = null;

  constructor(options: Partial<ReactNavigationV4InstrumentationOptions>) {
    super();

    this._options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
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

      // Need to handle the initial state as the router patch will only attach transactions on subsequent route changes.
      this._handleInitialState();
    }
  }

  /**
   * Starts an idle transaction for the initial state which won't get called by the router listener.
   */
  private _handleInitialState(): void {
    if (this._appContainerRef.current) {
      const navigationState = this._appContainerRef.current._navigation.state;

      const currentRoute = this._getCurrentRouteFromState(navigationState);

      if (
        this._options.shouldAttachTransaction(this._prevRoute, currentRoute)
      ) {
        this.onRouteWillChange(this._getTransactionContext(currentRoute));
      }

      this._prevRoute = currentRoute;
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
        const newNavigationState = originalGetStateForAction(action, state);
        const currentRoute = this._getCurrentRouteFromState(newNavigationState);

        // If the route is a different key, this is so we ignore actions that pertain to the same screen.
        if (!this._prevRoute || currentRoute.key !== this._prevRoute.key) {
          const context = this._getTransactionContext(currentRoute);

          if (
            this._options.shouldAttachTransaction(this._prevRoute, currentRoute)
          ) {
            this.onRouteWillChange(context);
          } else {
            logger.log(
              `[ReactNavigationV4Instrumentation] Will not send transaction "${context.name}" due to shouldAttachTransaction.`
            );
          }

          this._prevRoute = currentRoute;
        }

        return newNavigationState;
      };
    }
  }

  /**
   * Gets the transaction context for a `NavigationRoute`
   */
  private _getTransactionContext(route: NavigationRoute): TransactionContext {
    return {
      name: route.routeName,
      op: "navigation",
      tags: {
        "routing.instrumentation":
          ReactNavigationV4Instrumentation.instrumentationName,
        "routing.route.key": route.key,
      },
      data: route.params,
    };
  }

  /**
   * Gets the current route given a navigation state
   */
  private _getCurrentRouteFromState(state: NavigationState): NavigationRoute {
    const parentRoute = state.routes[state.index];

    if (
      "index" in parentRoute &&
      "routes" in parentRoute &&
      typeof parentRoute.index === "number" &&
      Array.isArray(parentRoute.routes)
    ) {
      return this._getCurrentRouteFromState(parentRoute);
    }

    return parentRoute as NavigationRoute;
  }
}

export { ReactNavigationV4Instrumentation };
