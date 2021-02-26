/* eslint-disable @typescript-eslint/no-explicit-any */
import { Transaction } from "@sentry/tracing";
import { getGlobalObject } from "@sentry/utils";

import {
  BLANK_TRANSACTION_CONTEXT_V5,
  NavigationRouteV5,
  ReactNavigationV5Instrumentation,
} from "../../src/js/tracing/reactnavigationv5";

const dummyRoute = {
  name: "Route",
  key: "0",
};

class MockNavigationContainer {
  currentRoute: NavigationRouteV5 = dummyRoute;
  listeners: Record<string, (e: any) => void> = {};
  addListener: any = jest.fn(
    (eventType: string, listener: (e: any) => void): void => {
      this.listeners[eventType] = listener;
    }
  );
  getCurrentRoute(): NavigationRouteV5 {
    return this.currentRoute;
  }
}

const getMockTransaction = () => {
  const transaction = new Transaction(BLANK_TRANSACTION_CONTEXT_V5);

  transaction.sampled = false;

  return transaction;
};

const _global = getGlobalObject<{
  __sentry_rn_v5_registered?: boolean;
}>();

afterEach(() => {
  _global.__sentry_rn_v5_registered = false;

  jest.resetAllMocks();
});

describe("ReactNavigationV5Instrumentation", () => {
  test("transaction set on initialize", () => {
    const instrumentation = new ReactNavigationV5Instrumentation();

    const mockTransaction = getMockTransaction();
    const tracingListener = jest.fn(() => mockTransaction);
    instrumentation.registerRoutingInstrumentation(
      tracingListener as any,
      (context) => context
    );

    const mockNavigationContainerRef = {
      current: new MockNavigationContainer(),
    };

    instrumentation.registerNavigationContainer(
      mockNavigationContainerRef as any
    );

    expect(mockTransaction.name).toBe(dummyRoute.name);
    expect(mockTransaction.tags).toStrictEqual({
      ...BLANK_TRANSACTION_CONTEXT_V5.tags,
      "routing.route.name": dummyRoute.name,
    });
    expect(mockTransaction.data).toStrictEqual({
      route: {
        name: dummyRoute.name,
        key: dummyRoute.key,
        params: {},
        hasBeenSeen: false,
      },
      previousRoute: null,
    });
  });

  test("transaction sent on navigation", async () => {
    const instrumentation = new ReactNavigationV5Instrumentation();

    // Need a dummy transaction as the instrumentation will start a transaction right away when the first navigation container is attached.
    const mockTransactionDummy = getMockTransaction();
    const transactionRef = {
      current: mockTransactionDummy,
    };
    const tracingListener = jest.fn(() => transactionRef.current);
    instrumentation.registerRoutingInstrumentation(
      tracingListener as any,
      (context) => context
    );

    const mockNavigationContainerRef = {
      current: new MockNavigationContainer(),
    };

    instrumentation.registerNavigationContainer(
      mockNavigationContainerRef as any
    );

    const mockTransaction = getMockTransaction();
    transactionRef.current = mockTransaction;

    mockNavigationContainerRef.current.listeners["__unsafe_action__"]({});

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        const route = {
          name: "New Route",
          key: "1",
          params: {
            someParam: 42,
          },
        };
        mockNavigationContainerRef.current.currentRoute = route;
        mockNavigationContainerRef.current.listeners["state"]({});

        expect(mockTransaction.name).toBe(route.name);
        expect(mockTransaction.tags).toStrictEqual({
          ...BLANK_TRANSACTION_CONTEXT_V5.tags,
          "routing.route.name": route.name,
        });
        expect(mockTransaction.data).toStrictEqual({
          route: {
            name: route.name,
            key: route.key,
            params: route.params,
            hasBeenSeen: false,
          },
          previousRoute: {
            name: dummyRoute.name,
            key: dummyRoute.key,
            params: {},
          },
        });

        resolve();
      }, 50);
    });
  });

  test("transaction context changed with beforeNavigate", async () => {
    const instrumentation = new ReactNavigationV5Instrumentation();

    // Need a dummy transaction as the instrumentation will start a transaction right away when the first navigation container is attached.
    const mockTransactionDummy = getMockTransaction();
    const transactionRef = {
      current: mockTransactionDummy,
    };
    const tracingListener = jest.fn(() => transactionRef.current);
    instrumentation.registerRoutingInstrumentation(
      tracingListener as any,
      (context) => {
        context.sampled = false;
        context.description = "Description";
        context.name = "New Name";

        return context;
      }
    );

    const mockNavigationContainerRef = {
      current: new MockNavigationContainer(),
    };

    instrumentation.registerNavigationContainer(
      mockNavigationContainerRef as any
    );

    const mockTransaction = getMockTransaction();
    transactionRef.current = mockTransaction;

    mockNavigationContainerRef.current.listeners["__unsafe_action__"]({});

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        const route = {
          name: "DoNotSend",
          key: "1",
        };
        mockNavigationContainerRef.current.currentRoute = route;
        mockNavigationContainerRef.current.listeners["state"]({});

        expect(mockTransaction.sampled).toBe(false);
        expect(mockTransaction.name).toBe("New Name");
        expect(mockTransaction.description).toBe("Description");
        resolve();
      }, 50);
    });
  });

  test("transaction not sent on a cancelled navigation", async () => {
    const instrumentation = new ReactNavigationV5Instrumentation();

    // Need a dummy transaction as the instrumentation will start a transaction right away when the first navigation container is attached.
    const mockTransactionDummy = getMockTransaction();
    const transactionRef = {
      current: mockTransactionDummy,
    };
    const tracingListener = jest.fn(() => transactionRef.current);
    instrumentation.registerRoutingInstrumentation(
      tracingListener as any,
      (context) => context
    );

    const mockNavigationContainerRef = {
      current: new MockNavigationContainer(),
    };

    instrumentation.registerNavigationContainer(
      mockNavigationContainerRef as any
    );

    const mockTransaction = getMockTransaction();
    transactionRef.current = mockTransaction;

    mockNavigationContainerRef.current.listeners["__unsafe_action__"]({});

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(mockTransaction.sampled).toBe(false);
        expect(mockTransaction.name).toStrictEqual(
          BLANK_TRANSACTION_CONTEXT_V5.name
        );
        expect(mockTransaction.tags).toStrictEqual(
          BLANK_TRANSACTION_CONTEXT_V5.tags
        );
        expect(mockTransaction.data).toStrictEqual({});
        resolve();
      }, 250);
    });
  });

  describe("navigation container registration", () => {
    test("registers navigation container object ref", () => {
      const instrumentation = new ReactNavigationV5Instrumentation();
      const mockNavigationContainer = new MockNavigationContainer();
      instrumentation.registerNavigationContainer({
        current: mockNavigationContainer,
      });

      expect(_global.__sentry_rn_v5_registered).toBe(true);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockNavigationContainer.addListener).toHaveBeenNthCalledWith(
        1,
        "__unsafe_action__",
        expect.any(Function)
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockNavigationContainer.addListener).toHaveBeenNthCalledWith(
        2,
        "state",
        expect.any(Function)
      );
    });

    test("registers navigation container direct ref", () => {
      const instrumentation = new ReactNavigationV5Instrumentation();
      const mockNavigationContainer = new MockNavigationContainer();
      instrumentation.registerNavigationContainer(mockNavigationContainer);

      expect(_global.__sentry_rn_v5_registered).toBe(true);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockNavigationContainer.addListener).toHaveBeenNthCalledWith(
        1,
        "__unsafe_action__",
        expect.any(Function)
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockNavigationContainer.addListener).toHaveBeenNthCalledWith(
        2,
        "state",
        expect.any(Function)
      );
    });
  });

  test("does not register navigation container if there is an existing one", () => {
    _global.__sentry_rn_v5_registered = true;

    const instrumentation = new ReactNavigationV5Instrumentation();
    const mockNavigationContainer = new MockNavigationContainer();
    instrumentation.registerNavigationContainer({
      current: mockNavigationContainer,
    });

    expect(_global.__sentry_rn_v5_registered).toBe(true);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockNavigationContainer.addListener).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockNavigationContainer.addListener).not.toHaveBeenCalled();
  });
});
