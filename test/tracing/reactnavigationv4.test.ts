/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  AppContainerInstance,
  NavigationRouteV4,
  NavigationStateV4,
  ReactNavigationV4Instrumentation,
} from "../../src/js/tracing/reactnavigationv4";

const initialRoute = {
  routeName: "Initial Route",
  key: "route0",
  params: {
    hello: true,
  },
};

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
        routes: [initialRoute],
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
    instrumentation.registerRoutingInstrumentation(
      tracingListener as any,
      (context) => context
    );

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
        route: {
          name: firstRoute.routeName,
          key: firstRoute.key,
          params: firstRoute.params,
          hasBeenSeen: false,
        },
        previousRoute: null,
      },
    });
  });

  test("transaction sent on navigation", () => {
    const instrumentation = new ReactNavigationV4Instrumentation();

    instrumentation.onRouteWillChange = jest.fn();

    const tracingListener = jest.fn();
    instrumentation.registerRoutingInstrumentation(
      tracingListener as any,
      (context) => context
    );

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
        route: {
          name: action.routeName,
          key: action.key,
          params: action.params,
          hasBeenSeen: false,
        },
        previousRoute: {
          name: "Initial Route",
          key: "route0",
          params: {
            hello: true,
          },
        },
      },
    });
  });

  test("transaction context changed with beforeNavigate", () => {
    const instrumentation = new ReactNavigationV4Instrumentation();

    const tracingListener = jest.fn();
    instrumentation.registerRoutingInstrumentation(
      tracingListener as any,
      (context) => {
        context.sampled = false;
        context.description = "Description";
        context.name = "New Name";
        context.tags = {};

        return context;
      }
    );

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
    expect(tracingListener).toHaveBeenCalledTimes(2);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(tracingListener).toHaveBeenLastCalledWith({
      name: "New Name",
      op: "navigation",
      description: "Description",
      tags: {},
      data: {
        route: {
          name: action.routeName,
          key: action.key,
          params: action.params,
          hasBeenSeen: false,
        },
        previousRoute: {
          name: "Initial Route",
          key: "route0",
          params: {
            hello: true,
          },
        },
      },
      sampled: false,
    });
  });

  test("transaction not attached on a cancelled navigation", () => {
    const instrumentation = new ReactNavigationV4Instrumentation();

    instrumentation.onRouteWillChange = jest.fn();

    const tracingListener = jest.fn();
    instrumentation.registerRoutingInstrumentation(
      tracingListener as any,
      (context) => context
    );

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
