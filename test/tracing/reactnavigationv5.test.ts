/* eslint-disable @typescript-eslint/no-explicit-any */
import {
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
  addListener(eventType: string, listener: (e: any) => void): void {
    this.listeners[eventType] = listener;
  }
  getCurrentRoute(): NavigationRouteV5 {
    return this.currentRoute;
  }
}

const getMockTransaction = () => ({
  sampled: false,
  setName: jest.fn(),
  setTag: jest.fn(),
  setData: jest.fn(),
  finish: jest.fn(),
});

describe("ReactNavigationV5Instrumentation", () => {
  test("transaction set on initialize", () => {
    const instrumentation = new ReactNavigationV5Instrumentation();

    const mockTransaction = getMockTransaction();
    const tracingListener = jest.fn(() => mockTransaction);
    instrumentation.registerRoutingInstrumentation(tracingListener as any);

    const mockNavigationContainerRef = {
      current: new MockNavigationContainer(),
    };

    instrumentation.registerNavigationContainer(
      mockNavigationContainerRef as any
    );

    expect(mockTransaction.sampled).toBe(true);
    expect(mockTransaction.setName).toBeCalledWith(dummyRoute.name);
    expect(mockTransaction.setTag).toBeCalledWith(
      "routing.route.name",
      dummyRoute.name
    );
    expect(mockTransaction.setData).toHaveBeenNthCalledWith(
      1,
      "routing.route.key",
      dummyRoute.key
    );
    expect(mockTransaction.setData).toHaveBeenNthCalledWith(
      2,
      "routing.route.params",
      undefined
    );
  });

  test("transaction sent on navigation", async () => {
    const instrumentation = new ReactNavigationV5Instrumentation();

    // Need a dummy transaction as the instrumentation will start a transaction right away when the first navigation container is attached.
    const mockTransactionDummy = getMockTransaction();
    const transactionRef = {
      current: mockTransactionDummy,
    };
    const tracingListener = jest.fn(() => transactionRef.current);
    instrumentation.registerRoutingInstrumentation(tracingListener as any);

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

        expect(mockTransaction.sampled).toBe(true);
        expect(mockTransaction.setName).toBeCalledWith(route.name);
        expect(mockTransaction.setTag).toBeCalledWith(
          "routing.route.name",
          route.name
        );
        expect(mockTransaction.setData).toHaveBeenNthCalledWith(
          1,
          "routing.route.key",
          route.key
        );
        expect(mockTransaction.setData).toHaveBeenNthCalledWith(
          2,
          "routing.route.params",
          route.params
        );
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
    instrumentation.registerRoutingInstrumentation(tracingListener as any);

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
        expect(mockTransaction.setName).not.toHaveBeenCalled();
        expect(mockTransaction.setTag).not.toHaveBeenCalled();
        expect(mockTransaction.setData).not.toHaveBeenCalled();
        resolve();
      }, 250);
    });
  });
});
