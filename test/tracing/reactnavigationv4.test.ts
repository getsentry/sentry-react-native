/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  AppContainerInstance,
  NavigationRouteV4,
  NavigationStateV4,
  ReactNavigationV4Instrumentation,
} from "../../src/js/tracing/reactnavigationv4";

class MockAppContainer implements AppContainerInstance {
  _navigation: {
    state: NavigationStateV4;
    router: {
      dispatchAction: (action: any) => void;
      getStateForAction: (
        action: any,
        state: NavigationStateV4
      ) => NavigationStateV4;
    };
  };

  constructor() {
    const router = {
      dispatchAction: (action: any) => {
        const newState = router.getStateForAction(
          action,
          this._navigation.state
        );

        this._navigation.state = newState;
      },
      getStateForAction: (action: any, state: NavigationStateV4) => {
        if (action.routeName === "DoNotNavigate") {
          return state;
        }

        return {
          ...state,
          index: state.routes.length,
          routes: [
            ...state.routes,
            {
              routeName: action.routeName,
              key: action.key,
              params: action.params,
            },
          ],
        };
      },
    };

    this._navigation = {
      state: {
        index: 0,
        key: "0",
        isTransitioning: false,
        routes: [
          {
            routeName: "Initial Route",
            key: "route0",
            params: {
              hello: true,
            },
          },
        ],
      },
      router,
    };
  }
}

describe("ReactNavigationV4Instrumentation", () => {
  test("transaction set on initialize", () => {
    const instrumentation = new ReactNavigationV4Instrumentation();

    instrumentation.onRouteWillChange = jest.fn();

    const tracingListener = jest.fn();
    instrumentation.registerRoutingInstrumentation(tracingListener as any);

    const mockAppContainerRef = {
      current: new MockAppContainer(),
    };

    instrumentation.registerAppContainer(mockAppContainerRef as any);

    const firstRoute = mockAppContainerRef.current._navigation.state
      .routes[0] as NavigationRouteV4;

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(instrumentation.onRouteWillChange).toHaveBeenCalledTimes(1);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(instrumentation.onRouteWillChange).toHaveBeenLastCalledWith({
      name: firstRoute.routeName,
      op: "navigation",
      tags: {
        "routing.instrumentation":
          ReactNavigationV4Instrumentation.instrumentationName,
        "routing.route.name": firstRoute.routeName,
      },
      data: {
        "routing.route.key": firstRoute.key,
        "routing.route.params": firstRoute.params,
        "routing.route.hasBeenSeen": false,
      },
    });
  });

  test("transaction sent on navigation", () => {
    const instrumentation = new ReactNavigationV4Instrumentation();

    instrumentation.onRouteWillChange = jest.fn();

    const tracingListener = jest.fn();
    instrumentation.registerRoutingInstrumentation(tracingListener as any);

    const mockAppContainerRef = {
      current: new MockAppContainer(),
    };

    instrumentation.registerAppContainer(mockAppContainerRef as any);

    const action = {
      routeName: "New Route",
      key: "key1",
      params: {
        someParam: 42,
      },
    };
    mockAppContainerRef.current._navigation.router.dispatchAction(action);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(instrumentation.onRouteWillChange).toHaveBeenCalledTimes(2);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(instrumentation.onRouteWillChange).toHaveBeenLastCalledWith({
      name: action.routeName,
      op: "navigation",
      tags: {
        "routing.instrumentation":
          ReactNavigationV4Instrumentation.instrumentationName,
        "routing.route.name": action.routeName,
      },
      data: {
        "routing.route.key": action.key,
        "routing.route.params": action.params,
        "routing.route.hasBeenSeen": false,
      },
    });
  });

  test("not sampled with shouldSendTransaction", () => {
    const instrumentation = new ReactNavigationV4Instrumentation({
      shouldSendTransaction: (newRoute) => {
        if (newRoute.routeName === "DoNotSend") {
          return false;
        }

        return true;
      },
    });

    instrumentation.onRouteWillChange = jest.fn();

    const tracingListener = jest.fn();
    instrumentation.registerRoutingInstrumentation(tracingListener as any);

    const mockAppContainerRef = {
      current: new MockAppContainer(),
    };

    instrumentation.registerAppContainer(mockAppContainerRef as any);

    const action = {
      routeName: "DoNotSend",
      key: "key1",
      params: {
        someParam: 42,
      },
    };
    mockAppContainerRef.current._navigation.router.dispatchAction(action);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(instrumentation.onRouteWillChange).toHaveBeenCalledTimes(2);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(instrumentation.onRouteWillChange).toHaveBeenLastCalledWith({
      name: action.routeName,
      op: "navigation",
      tags: {
        "routing.instrumentation":
          ReactNavigationV4Instrumentation.instrumentationName,
        "routing.route.name": action.routeName,
      },
      data: {
        "routing.route.key": action.key,
        "routing.route.params": action.params,
        "routing.route.hasBeenSeen": false,
      },
      sampled: false,
    });
  });

  test("transaction not attached on a cancelled navigation", () => {
    const instrumentation = new ReactNavigationV4Instrumentation();

    instrumentation.onRouteWillChange = jest.fn();

    const tracingListener = jest.fn();
    instrumentation.registerRoutingInstrumentation(tracingListener as any);

    const mockAppContainerRef = {
      current: new MockAppContainer(),
    };

    instrumentation.registerAppContainer(mockAppContainerRef as any);

    const action = {
      routeName: "DoNotNavigate",
    };
    mockAppContainerRef.current._navigation.router.dispatchAction(action);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(instrumentation.onRouteWillChange).toHaveBeenCalledTimes(1);
  });
});
