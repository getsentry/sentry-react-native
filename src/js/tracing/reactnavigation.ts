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

interface ReactNavigationInstrumentationOptions {
  /**
   * The action types that will trigger a transaction to be set on the scope.
   * If you set this property, this will completely overwrite the default and not merge.
   *
   * Default: ["NAVIGATE", "PUSH", "POP", "REPLACE"]
   */
  navigationActionTypes: string[];
}

const DEFAULT_OPTIONS: ReactNavigationInstrumentationOptions = {
  navigationActionTypes: ["NAVIGATE", "PUSH", "POP", "REPLACE"],
};

/**
 * Instrumentation for React-Navigation V5. See docs or sample app for usage.
 */
export class ReactNavigationInstrumentation extends RoutingInstrumentation {
  static instrumentationName: string = "react-navigation-v5";

  private _options: ReactNavigationInstrumentationOptions;

  constructor(_options: Partial<ReactNavigationInstrumentationOptions>) {
    super();
    this._options = {
      ...DEFAULT_OPTIONS,
      ..._options,
    };
  }

  /**
   * Pass the ref to the navigation container to register it to the instrumentation
   * @param navigationContainerRef Ref to a `NavigationContainer`
   */
  public registerNavigationContainer(navigationContainerRef: {
    current?: NavigationContainer;
  }): void {
    navigationContainerRef.current?.addListener(
      "__unsafe_action__", // This action is emitted on every dispatch
      this._onDispatch.bind(this)
    );
  }

  /** To be called on every React-Navigation action dispatch */
  private _onDispatch(dispatchProp: DispatchProp): void {
    const action = dispatchProp.data?.action;
    if (action) {
      const { type, payload } = action;
      if (this._options.navigationActionTypes.includes(type) && payload) {
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
        "routing.route.key": payload.key,
      },
      data: payload.params,
    };
  }
}
