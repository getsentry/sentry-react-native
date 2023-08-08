/* eslint-disable @typescript-eslint/no-explicit-any */
import { Transaction } from '@sentry/core';
import type { TransactionContext } from '@sentry/types';

import type { NavigationRoute } from '../../src/js/tracing/reactnavigation';
import { BLANK_TRANSACTION_CONTEXT, ReactNavigationInstrumentation } from '../../src/js/tracing/reactnavigation';
import { RN_GLOBAL_OBJ } from '../../src/js/utils/worldwide';

const dummyRoute = {
  name: 'Route',
  key: '0',
};

class MockNavigationContainer {
  currentRoute: NavigationRoute | undefined = dummyRoute;
  listeners: Record<string, (e: any) => void> = {};
  addListener: any = jest.fn((eventType: string, listener: (e: any) => void): void => {
    this.listeners[eventType] = listener;
  });
  getCurrentRoute(): NavigationRoute | undefined {
    return this.currentRoute;
  }
}

const getMockTransaction = () => {
  const transaction = new Transaction(BLANK_TRANSACTION_CONTEXT);

  // Assume it's sampled
  transaction.sampled = true;

  return transaction;
};

describe('ReactNavigationInstrumentation', () => {
  afterEach(() => {
    RN_GLOBAL_OBJ.__sentry_rn_v5_registered = false;

    jest.resetAllMocks();
  });

  test('transaction set on initialize', () => {
    const instrumentation = new ReactNavigationInstrumentation();

    const mockTransaction = getMockTransaction();
    const tracingListener = jest.fn(() => mockTransaction);
    instrumentation.registerRoutingInstrumentation(
      tracingListener as any,
      context => context,
      () => {},
    );

    const mockNavigationContainerRef = {
      current: new MockNavigationContainer(),
    };

    instrumentation.registerNavigationContainer(mockNavigationContainerRef as any);

    expect(mockTransaction.name).toBe(dummyRoute.name);
    expect(mockTransaction.tags).toStrictEqual({
      ...BLANK_TRANSACTION_CONTEXT.tags,
      'routing.route.name': dummyRoute.name,
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
    expect(mockTransaction.metadata.source).toBe('component');
  });

  test('transaction sent on navigation', async () => {
    const instrumentation = new ReactNavigationInstrumentation();

    // Need a dummy transaction as the instrumentation will start a transaction right away when the first navigation container is attached.
    const mockTransactionDummy = getMockTransaction();
    const transactionRef = {
      current: mockTransactionDummy,
    };
    const tracingListener = jest.fn(() => transactionRef.current);
    instrumentation.registerRoutingInstrumentation(
      tracingListener as any,
      context => context,
      () => {},
    );

    const mockNavigationContainerRef = {
      current: new MockNavigationContainer(),
    };

    instrumentation.registerNavigationContainer(mockNavigationContainerRef as any);

    const mockTransaction = getMockTransaction();
    transactionRef.current = mockTransaction;

    mockNavigationContainerRef.current.listeners['__unsafe_action__']({});

    await new Promise<void>(resolve => {
      setTimeout(() => {
        const route = {
          name: 'New Route',
          key: '1',
          params: {
            someParam: 42,
          },
        };
        // If .getCurrentRoute() is undefined, ignore state change
        mockNavigationContainerRef.current.currentRoute = undefined;
        mockNavigationContainerRef.current.listeners['state']({});

        mockNavigationContainerRef.current.currentRoute = route;
        mockNavigationContainerRef.current.listeners['state']({});

        expect(mockTransaction.name).toBe(route.name);
        expect(mockTransaction.tags).toStrictEqual({
          ...BLANK_TRANSACTION_CONTEXT.tags,
          'routing.route.name': route.name,
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
        expect(mockTransaction.metadata.source).toBe('component');

        resolve();
      }, 50);
    });
  });

  test('transaction context changed with beforeNavigate', async () => {
    const instrumentation = new ReactNavigationInstrumentation();

    // Need a dummy transaction as the instrumentation will start a transaction right away when the first navigation container is attached.
    const mockTransactionDummy = getMockTransaction();
    const transactionRef = {
      current: mockTransactionDummy,
    };
    const tracingListener = jest.fn(() => transactionRef.current);
    instrumentation.registerRoutingInstrumentation(
      tracingListener as any,
      context => {
        context.sampled = false;
        context.description = 'Description';
        context.name = 'New Name';

        return context;
      },
      () => {},
    );

    const mockNavigationContainerRef = {
      current: new MockNavigationContainer(),
    };

    instrumentation.registerNavigationContainer(mockNavigationContainerRef as any);

    const mockTransaction = getMockTransaction();
    transactionRef.current = mockTransaction;

    mockNavigationContainerRef.current.listeners['__unsafe_action__']({});

    await new Promise<void>(resolve => {
      setTimeout(() => {
        const route = {
          name: 'DoNotSend',
          key: '1',
        };
        mockNavigationContainerRef.current.currentRoute = route;
        mockNavigationContainerRef.current.listeners['state']({});

        expect(mockTransaction.sampled).toBe(false);
        expect(mockTransaction.name).toBe('New Name');
        expect(mockTransaction.description).toBe('Description');
        expect(mockTransaction.metadata.source).toBe('custom');
        resolve();
      }, 50);
    });
  });

  test('transaction not sent on a cancelled navigation', async () => {
    const instrumentation = new ReactNavigationInstrumentation();

    // Need a dummy transaction as the instrumentation will start a transaction right away when the first navigation container is attached.
    const mockTransactionDummy = getMockTransaction();
    const transactionRef = {
      current: mockTransactionDummy,
    };
    const tracingListener = jest.fn(() => transactionRef.current);
    instrumentation.registerRoutingInstrumentation(
      tracingListener as any,
      context => context,
      () => {},
    );

    const mockNavigationContainerRef = {
      current: new MockNavigationContainer(),
    };

    instrumentation.registerNavigationContainer(mockNavigationContainerRef as any);

    const mockTransaction = getMockTransaction();
    transactionRef.current = mockTransaction;

    mockNavigationContainerRef.current.listeners['__unsafe_action__']({});

    await new Promise<void>(resolve => {
      setTimeout(() => {
        expect(mockTransaction.sampled).toBe(false);
        expect(mockTransaction.name).toStrictEqual(BLANK_TRANSACTION_CONTEXT.name);
        expect(mockTransaction.tags).toStrictEqual(BLANK_TRANSACTION_CONTEXT.tags);
        expect(mockTransaction.data).toStrictEqual({});
        resolve();
      }, 1100);
    });
  });

  test('transaction not sent on multiple cancelled navigations', async () => {
    const instrumentation = new ReactNavigationInstrumentation();

    // Need a dummy transaction as the instrumentation will start a transaction right away when the first navigation container is attached.
    const mockTransactionDummy = getMockTransaction();
    const transactionRef = {
      current: mockTransactionDummy,
    };
    const tracingListener = jest.fn(() => transactionRef.current);
    instrumentation.registerRoutingInstrumentation(
      tracingListener as any,
      context => context,
      () => {},
    );

    const mockNavigationContainerRef = {
      current: new MockNavigationContainer(),
    };

    instrumentation.registerNavigationContainer(mockNavigationContainerRef as any);

    const mockTransaction1 = getMockTransaction();
    transactionRef.current = mockTransaction1;

    mockNavigationContainerRef.current.listeners['__unsafe_action__']({});

    const mockTransaction2 = getMockTransaction();
    transactionRef.current = mockTransaction2;

    mockNavigationContainerRef.current.listeners['__unsafe_action__']({});

    await new Promise<void>(resolve => {
      setTimeout(() => {
        expect(mockTransaction1.sampled).toBe(false);
        expect(mockTransaction2.sampled).toBe(false);
        resolve();
      }, 1100);
    });
  });

  describe('navigation container registration', () => {
    test('registers navigation container object ref', () => {
      const instrumentation = new ReactNavigationInstrumentation();
      const mockNavigationContainer = new MockNavigationContainer();
      instrumentation.registerNavigationContainer({
        current: mockNavigationContainer,
      });

      expect(RN_GLOBAL_OBJ.__sentry_rn_v5_registered).toBe(true);

      expect(mockNavigationContainer.addListener).toHaveBeenNthCalledWith(1, '__unsafe_action__', expect.any(Function));
      expect(mockNavigationContainer.addListener).toHaveBeenNthCalledWith(2, 'state', expect.any(Function));
    });

    test('registers navigation container direct ref', () => {
      const instrumentation = new ReactNavigationInstrumentation();
      const mockNavigationContainer = new MockNavigationContainer();
      instrumentation.registerNavigationContainer(mockNavigationContainer);

      expect(RN_GLOBAL_OBJ.__sentry_rn_v5_registered).toBe(true);

      expect(mockNavigationContainer.addListener).toHaveBeenNthCalledWith(1, '__unsafe_action__', expect.any(Function));
      expect(mockNavigationContainer.addListener).toHaveBeenNthCalledWith(2, 'state', expect.any(Function));
    });

    test('does not register navigation container if there is an existing one', () => {
      RN_GLOBAL_OBJ.__sentry_rn_v5_registered = true;

      const instrumentation = new ReactNavigationInstrumentation();
      const mockNavigationContainer = new MockNavigationContainer();
      instrumentation.registerNavigationContainer({
        current: mockNavigationContainer,
      });

      expect(RN_GLOBAL_OBJ.__sentry_rn_v5_registered).toBe(true);

      expect(mockNavigationContainer.addListener).not.toHaveBeenCalled();
      expect(mockNavigationContainer.addListener).not.toHaveBeenCalled();
    });

    test('works if routing instrumentation registration is after navigation registration', async () => {
      const instrumentation = new ReactNavigationInstrumentation();

      const mockNavigationContainer = new MockNavigationContainer();
      instrumentation.registerNavigationContainer(mockNavigationContainer);

      const mockTransaction = getMockTransaction();
      const tracingListener = jest.fn(() => mockTransaction);
      instrumentation.registerRoutingInstrumentation(
        tracingListener as any,
        context => context,
        () => {},
      );

      await new Promise<void>(resolve => {
        setTimeout(() => {
          expect(mockTransaction.sampled).not.toBe(false);
          resolve();
        }, 500);
      });
    });
  });

  describe('options', () => {
    test('waits until routeChangeTimeoutMs', async () => {
      const instrumentation = new ReactNavigationInstrumentation({
        routeChangeTimeoutMs: 200,
      });

      const mockTransaction = getMockTransaction();
      const tracingListener = jest.fn(() => mockTransaction);
      instrumentation.registerRoutingInstrumentation(
        tracingListener as any,
        context => context,
        () => {},
      );

      const mockNavigationContainerRef = {
        current: new MockNavigationContainer(),
      };

      return new Promise<void>(resolve => {
        setTimeout(() => {
          instrumentation.registerNavigationContainer(mockNavigationContainerRef as any);

          expect(mockTransaction.sampled).toBe(true);
          expect(mockTransaction.name).toBe(dummyRoute.name);

          resolve();
        }, 190);
      });
    });

    test('discards if after routeChangeTimeoutMs', async () => {
      const instrumentation = new ReactNavigationInstrumentation({
        routeChangeTimeoutMs: 200,
      });

      const mockTransaction = getMockTransaction();
      const tracingListener = jest.fn(() => mockTransaction);
      instrumentation.registerRoutingInstrumentation(
        tracingListener as any,
        context => context,
        () => {},
      );

      const mockNavigationContainerRef = {
        current: new MockNavigationContainer(),
      };

      return new Promise<void>(resolve => {
        setTimeout(() => {
          instrumentation.registerNavigationContainer(mockNavigationContainerRef as any);

          expect(mockTransaction.sampled).toBe(false);
          resolve();
        }, 210);
      });
    });
  });

  describe('onRouteConfirmed', () => {
    test('onRouteConfirmed called with correct route data', () => {
      const instrumentation = new ReactNavigationInstrumentation();

      // Need a dummy transaction as the instrumentation will start a transaction right away when the first navigation container is attached.
      const mockTransactionDummy = getMockTransaction();
      const transactionRef = {
        current: mockTransactionDummy,
      };
      let confirmedContext: TransactionContext | undefined;
      const tracingListener = jest.fn(() => transactionRef.current);
      instrumentation.registerRoutingInstrumentation(
        tracingListener as any,
        context => context,
        context => {
          confirmedContext = context;
        },
      );

      const mockNavigationContainerRef = {
        current: new MockNavigationContainer(),
      };

      instrumentation.registerNavigationContainer(mockNavigationContainerRef as any);

      const mockTransaction = getMockTransaction();
      transactionRef.current = mockTransaction;

      mockNavigationContainerRef.current.listeners['__unsafe_action__']({});

      const route1 = {
        name: 'New Route 1',
        key: '1',
        params: {
          someParam: 42,
        },
      };

      mockNavigationContainerRef.current.currentRoute = route1;
      mockNavigationContainerRef.current.listeners['state']({});

      mockNavigationContainerRef.current.listeners['__unsafe_action__']({});

      const route2 = {
        name: 'New Route 2',
        key: '2',
        params: {
          someParam: 42,
        },
      };

      mockNavigationContainerRef.current.currentRoute = route2;
      mockNavigationContainerRef.current.listeners['state']({});

      expect(confirmedContext).toBeDefined();
      if (confirmedContext) {
        expect(confirmedContext.name).toBe(route2.name);
        expect(confirmedContext.metadata).toBeUndefined();
        expect(confirmedContext.data).toBeDefined();
        if (confirmedContext.data) {
          expect(confirmedContext.data.route.name).toBe(route2.name);
          expect(confirmedContext.data.previousRoute).toBeDefined();
          if (confirmedContext.data.previousRoute) {
            expect(confirmedContext.data.previousRoute.name).toBe(route1.name);
          }
        }
      }
    });
  });
});
