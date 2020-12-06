import { TransactionContext } from "@sentry/types";

import { RoutingInstrumentation } from "./router";

interface NavigationPayload {
  key: string;
  name: string;
  params?: any;
}

interface DispatchProp {
  data: {
    action: {
      type: string;
      payload: NavigationPayload;
    };
  };
}

interface NavigationContainer {
  addListener: (type: string, listener: any) => void;
}

interface NavigationContainerRef {
  current?: NavigationContainer;
}

/**
 *
 */
export class ReactNavigationInstrumentation extends RoutingInstrumentation {
  static instrumentationName: string = "react-navigation";

  /**
   *
   */
  public registerNavigationContainer(
    navigationContainerRef: NavigationContainerRef
  ): void {
    navigationContainerRef.current?.addListener(
      "__unsafe_action__",
      this._onDispatch.bind(this)
    );
  }

  /**
   * Function to be called on every React-Navigation action dispatch
   */
  private _onDispatch(dispatchProp: DispatchProp): void {
    const action = dispatchProp.data?.action;
    if (action) {
      const { type, payload } = action;
      if (type === "NAVIGATE" && payload) {
        const routeContext = this._getRouteContextFromPayload(payload);
        this.onRouteWillChange(routeContext);
      }
    }
  }

  /** Transforms the React-Navigation NavigationState into our RouteContext */
  private _getRouteContextFromPayload(
    payload: NavigationPayload
  ): TransactionContext {
    return {
      name: payload.name,
      op: "navigation",
      tags: {
        "routing.instrumentation":
          ReactNavigationInstrumentation.instrumentationName,
      },
      data: payload.params,
    };
  }
}
