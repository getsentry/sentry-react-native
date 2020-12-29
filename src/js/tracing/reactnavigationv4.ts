import { TransactionContext } from "@sentry/types";
import { logger } from "@sentry/utils";

import { RoutingInstrumentation } from "./router";

interface State {
  key: string;
  isTransitioning: boolean;
  routes: { routeName: string }[];
}

interface PathAndParams {
  path: string;
  params: Record<any, any>;
}

interface AppContainerInstance {
  _navigation: {
    state: State;
    router: {
      getPathAndParamsForState: (navigationState: State) => PathAndParams;
      getStateForAction: (action: any, state: State) => State;
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
      const state = this._appContainerRef.current._navigation.state;
      const pathAndParams = this._appContainerRef.current._navigation.router.getPathAndParamsForState(
        state
      );

      this.onRouteWillChange(this._getPathTransactionContext(pathAndParams));
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
      const getPathAndParamsForState = this._appContainerRef.current._navigation
        .router.getPathAndParamsForState;

      this._appContainerRef.current._navigation.router.getStateForAction = (
        action,
        state
      ) => {
        const newState = originalGetStateForAction(action, state);
        const pathAndParams = getPathAndParamsForState(newState);

        if (newState.isTransitioning) {
          this.onRouteWillChange(
            this._getPathTransactionContext(pathAndParams)
          );
        }

        return newState;
      };
    }
  }

  /**
   * Gets the transaction context for a PathAndParams
   */
  private _getPathTransactionContext(
    pathAndParams: PathAndParams
  ): TransactionContext {
    return {
      name: `Navigation Focus: ${pathAndParams.path}`,
      op: "navigation",
      tags: {
        "routing.instrumentation":
          ReactNavigationV4Instrumentation.instrumentationName,
      },
      data: pathAndParams.params,
    };
  }
}

export { ReactNavigationV4Instrumentation };
