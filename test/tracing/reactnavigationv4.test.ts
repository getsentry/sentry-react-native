/* eslint-disable @typescript-eslint/no-explicit-any */
import { Transaction } from '@sentry/core';
import type { TransactionContext } from '@sentry/types';

import type {
  AppContainerInstance,
  NavigationRouteV4,
  NavigationStateV4,
} from '../../src/js/tracing/reactnavigationv4';
import {
  INITIAL_TRANSACTION_CONTEXT_V4,
  ReactNavigationV4Instrumentation,
} from '../../src/js/tracing/reactnavigationv4';
import { RN_GLOBAL_OBJ } from '../../src/js/utils/worldwide';

const initialRoute = {
  routeName: 'Initial Route',
  key: 'route0',
  params: {
    hello: true,
  },
};

const getMockTransaction = () => {
  const transaction = new Transaction(INITIAL_TRANSACTION_CONTEXT_V4);

  // Assume it's sampled
  transaction.sampled = true;

  return transaction;
};

class MockAppContainer implements AppContainerInstance {
  _navigation: {
    state: NavigationStateV4;
    router: {
      dispatchAction: (action: any) => void;
      getStateForAction: (action: any, state: NavigationStateV4) => NavigationStateV4;
    };
  };

  constructor() {
    const router = {
      dispatchAction: (action: any) => {
        const newState = router.getStateForAction(action, this._navigation.state);

        this._navigation.state = newState;
      },
      getStateForAction: (action: any, state: NavigationStateV4) => {
        if (action.routeName === 'DoNotNavigate') {
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
        key: '0',
        isTransitioning: false,
        routes: [initialRoute],
      },
      router,
    };
  }
}

afterEach(() => {
  RN_GLOBAL_OBJ.__sentry_rn_v4_registered = false;

  jest.resetAllMocks();
});

describe('ReactNavigationV4Instrumentation', () => {
  test('transaction set on initialize', () => {
    const instrumentation = new ReactNavigationV4Instrumentation();

    const mockTransaction = getMockTransaction();
    instrumentation.onRouteWillChange = jest.fn(() => mockTransaction);

    const tracingListener = jest.fn();
    instrumentation.registerRoutingInstrumentation(
      tracingListener as any,
      context => context,
      () => {},
    );

    const mockAppContainerRef = {
      current: new MockAppContainer(),
    };

    instrumentation.registerAppContainer(mockAppContainerRef as any);

    const firstRoute = mockAppContainerRef.current._navigation.state.routes[0] as NavigationRouteV4;

    expect(instrumentation.onRouteWillChange).toHaveBeenCalledTimes(1);

    expect(instrumentation.onRouteWillChange).toHaveBeenLastCalledWith(INITIAL_TRANSACTION_CONTEXT_V4);

    expect(mockTransaction.name).toBe(firstRoute.routeName);
    expect(mockTransaction.tags).toStrictEqual({
      'routing.instrumentation': ReactNavigationV4Instrumentation.instrumentationName,
      'routing.route.name': firstRoute.routeName,
    });
    expect(mockTransaction.data).toStrictEqual({
      route: {
        name: firstRoute.routeName,
        key: firstRoute.key,
        params: firstRoute.params,
        hasBeenSeen: false,
      },
      previousRoute: null,
    });
    expect(mockTransaction.sampled).toBe(true);
    expect(mockTransaction.metadata.source).toBe('component');
  });

  test('transaction sent on navigation', () => {
    const instrumentation = new ReactNavigationV4Instrumentation();

    const mockTransaction = getMockTransaction();
    instrumentation.onRouteWillChange = jest.fn(() => mockTransaction);

    const tracingListener = jest.fn();
    instrumentation.registerRoutingInstrumentation(
      tracingListener as any,
      context => context,
      () => {},
    );

    const mockAppContainerRef = {
      current: new MockAppContainer(),
    };

    instrumentation.registerAppContainer(mockAppContainerRef as any);

    const action = {
      routeName: 'New Route',
      key: 'key1',
      params: {
        someParam: 42,
      },
    };
    mockAppContainerRef.current._navigation.router.dispatchAction(action);

    expect(instrumentation.onRouteWillChange).toHaveBeenCalledTimes(2);

    expect(instrumentation.onRouteWillChange).toHaveBeenLastCalledWith({
      name: action.routeName,
      op: 'navigation',
      tags: {
        'routing.instrumentation': ReactNavigationV4Instrumentation.instrumentationName,
        'routing.route.name': action.routeName,
      },
      data: {
        route: {
          name: action.routeName,
          key: action.key,
          params: action.params,
          hasBeenSeen: false,
        },
        previousRoute: {
          name: 'Initial Route',
          key: 'route0',
          params: {
            hello: true,
          },
        },
      },
    });

    expect(mockTransaction.sampled).toBe(true);
    expect(mockTransaction.metadata.source).toBe('component');
  });

  test('transaction context changed with beforeNavigate', () => {
    const instrumentation = new ReactNavigationV4Instrumentation();

    const mockTransaction = getMockTransaction();
    const tracingListener = jest.fn(() => mockTransaction);
    instrumentation.registerRoutingInstrumentation(
      tracingListener as any,
      context => {
        context.sampled = false;
        context.description = 'Description';
        context.name = 'New Name';
        context.tags = {};

        return context;
      },
      () => {},
    );

    const mockAppContainerRef = {
      current: new MockAppContainer(),
    };

    instrumentation.registerAppContainer(mockAppContainerRef as any);

    const action = {
      routeName: 'DoNotSend',
      key: 'key1',
      params: {
        someParam: 42,
      },
    };
    mockAppContainerRef.current._navigation.router.dispatchAction(action);

    expect(tracingListener).toHaveBeenCalledTimes(2);

    expect(tracingListener).toHaveBeenLastCalledWith({
      name: 'New Name',
      op: 'navigation',
      description: 'Description',
      tags: {},
      data: {
        route: {
          name: action.routeName,
          key: action.key,
          params: action.params,
          hasBeenSeen: false,
        },
        previousRoute: {
          name: 'Initial Route',
          key: 'route0',
          params: {
            hello: true,
          },
        },
      },
      sampled: false,
    });

    expect(mockTransaction.sampled).toBe(false);
    expect(mockTransaction.metadata.source).toBe('custom');
  });

  test('transaction not attached on a cancelled navigation', () => {
    const instrumentation = new ReactNavigationV4Instrumentation();

    const mockTransaction = getMockTransaction();
    instrumentation.onRouteWillChange = jest.fn(() => mockTransaction);

    const tracingListener = jest.fn();
    instrumentation.registerRoutingInstrumentation(
      tracingListener as any,
      context => context,
      () => {},
    );

    const mockAppContainerRef = {
      current: new MockAppContainer(),
    };

    instrumentation.registerAppContainer(mockAppContainerRef as any);

    const action = {
      routeName: 'DoNotNavigate',
    };
    mockAppContainerRef.current._navigation.router.dispatchAction(action);

    expect(instrumentation.onRouteWillChange).toHaveBeenCalledTimes(1);
  });

  describe('navigation container registration', () => {
    test('registers navigation container object ref', () => {
      const instrumentation = new ReactNavigationV4Instrumentation();
      const mockTransaction = getMockTransaction();
      instrumentation.onRouteWillChange = jest.fn(() => mockTransaction);

      const tracingListener = jest.fn();
      instrumentation.registerRoutingInstrumentation(
        tracingListener as any,
        context => context,
        () => {},
      );

      const mockAppContainer = new MockAppContainer();
      instrumentation.registerAppContainer({
        current: mockAppContainer,
      });

      expect(RN_GLOBAL_OBJ.__sentry_rn_v4_registered).toBe(true);

      expect(instrumentation.onRouteWillChange).toHaveBeenCalledTimes(1);
      expect(mockTransaction.name).toBe(initialRoute.routeName);
      expect(mockTransaction.sampled).toBe(true);
    });

    test('registers navigation container direct ref', () => {
      const instrumentation = new ReactNavigationV4Instrumentation();
      const mockTransaction = getMockTransaction();
      instrumentation.onRouteWillChange = jest.fn(() => mockTransaction);

      const tracingListener = jest.fn();
      instrumentation.registerRoutingInstrumentation(
        tracingListener as any,
        context => context,
        () => {},
      );

      const mockAppContainer = new MockAppContainer();
      instrumentation.registerAppContainer(mockAppContainer);

      expect(RN_GLOBAL_OBJ.__sentry_rn_v4_registered).toBe(true);

      expect(instrumentation.onRouteWillChange).toHaveBeenCalledTimes(1);
      expect(mockTransaction.name).toBe(initialRoute.routeName);
      expect(mockTransaction.sampled).toBe(true);
    });

    test('does not register navigation container if there is an existing one', async () => {
      RN_GLOBAL_OBJ.__sentry_rn_v4_registered = true;

      const instrumentation = new ReactNavigationV4Instrumentation();
      const mockTransaction = getMockTransaction();
      instrumentation.onRouteWillChange = jest.fn(() => mockTransaction);

      const tracingListener = jest.fn();
      instrumentation.registerRoutingInstrumentation(
        tracingListener as any,
        context => context,
        () => {},
      );

      const mockAppContainer = new MockAppContainer();
      instrumentation.registerAppContainer(mockAppContainer);

      expect(RN_GLOBAL_OBJ.__sentry_rn_v4_registered).toBe(true);

      await new Promise<void>(resolve => {
        setTimeout(() => {
          expect(mockTransaction.sampled).toBe(false);
          resolve();
        }, 1100);
      });
    });

    test('works if routing instrumentation registration is after navigation registration', async () => {
      const instrumentation = new ReactNavigationV4Instrumentation();

      const mockNavigationContainer = new MockAppContainer();
      instrumentation.registerAppContainer(mockNavigationContainer);

      const mockTransaction = getMockTransaction();
      const tracingListener = jest.fn(() => mockTransaction);
      instrumentation.registerRoutingInstrumentation(
        tracingListener as any,
        context => context,
        () => {},
      );

      await new Promise<void>(resolve => {
        setTimeout(() => {
          expect(mockTransaction.sampled).toBe(true);
          resolve();
        }, 500);
      });
    });
  });

  describe('options', () => {
    test('waits until routeChangeTimeoutMs', async () => {
      const instrumentation = new ReactNavigationV4Instrumentation({
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
        current: new MockAppContainer(),
      };

      return new Promise<void>(resolve => {
        setTimeout(() => {
          instrumentation.registerAppContainer(mockNavigationContainerRef as any);

          expect(mockTransaction.sampled).toBe(true);
          expect(mockTransaction.name).toBe(initialRoute.routeName);

          resolve();
        }, 190);
      });
    });

    test('discards if after routeChangeTimeoutMs', async () => {
      const instrumentation = new ReactNavigationV4Instrumentation({
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
        current: new MockAppContainer(),
      };

      return new Promise<void>(resolve => {
        setTimeout(() => {
          instrumentation.registerAppContainer(mockNavigationContainerRef as any);

          expect(mockTransaction.sampled).toBe(false);
          resolve();
        }, 210);
      });
    });
  });

  describe('onRouteConfirmed', () => {
    test('onRouteConfirmed called with correct route data', () => {
      const instrumentation = new ReactNavigationV4Instrumentation();

      const mockTransaction = getMockTransaction();
      instrumentation.onRouteWillChange = jest.fn(() => mockTransaction);

      const tracingListener = jest.fn();
      let confirmedContext: TransactionContext | undefined;
      instrumentation.registerRoutingInstrumentation(
        tracingListener as any,
        context => context,
        context => {
          confirmedContext = context;
        },
      );

      const mockAppContainerRef = {
        current: new MockAppContainer(),
      };

      instrumentation.registerAppContainer(mockAppContainerRef as any);

      const route1 = {
        routeName: 'New Route 1',
        key: '1',
        params: {
          someParam: 42,
        },
      };
      mockAppContainerRef.current._navigation.router.dispatchAction(route1);

      const route2 = {
        routeName: 'New Route 2',
        key: '2',
        params: {
          someParam: 42,
        },
      };
      mockAppContainerRef.current._navigation.router.dispatchAction(route2);

      expect(confirmedContext).toBeDefined();
      if (confirmedContext) {
        expect(confirmedContext.name).toBe(route2.routeName);
        expect(confirmedContext.data).toBeDefined();
        expect(confirmedContext.metadata).toBeUndefined();
        if (confirmedContext.data) {
          expect(confirmedContext.data.route.name).toBe(route2.routeName);
          expect(confirmedContext.data.previousRoute).toBeDefined();
          if (confirmedContext.data.previousRoute) {
            expect(confirmedContext.data.previousRoute.name).toBe(route1.routeName);
          }
        }
      }
    });
  });
});
