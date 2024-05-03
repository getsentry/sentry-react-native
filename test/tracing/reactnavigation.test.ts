/* eslint-disable deprecation/deprecation */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { getCurrentScope, getGlobalScope, getIsolationScope, SentrySpan, setCurrentClient } from '@sentry/core';

import { ReactNativeTracing } from '../../src/js';
import type { NavigationRoute } from '../../src/js/tracing/reactnavigation';
import { BLANK_TRANSACTION_CONTEXT, ReactNavigationInstrumentation } from '../../src/js/tracing/reactnavigation';
import {
  SEMANTIC_ATTRIBUTE_PREVIOUS_ROUTE_KEY,
  SEMANTIC_ATTRIBUTE_PREVIOUS_ROUTE_NAME,
  SEMANTIC_ATTRIBUTE_ROUTE_HAS_BEEN_SEEN,
  SEMANTIC_ATTRIBUTE_ROUTE_KEY,
  SEMANTIC_ATTRIBUTE_ROUTE_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '../../src/js/tracing/semanticAttributes';
import type { BeforeNavigate } from '../../src/js/tracing/types';
import { RN_GLOBAL_OBJ } from '../../src/js/utils/worldwide';
import { getDefaultTestClientOptions,setupTestClient,TestClient } from '../mocks/client';
import { createMockNavigationAndAttachTo } from './reactnavigationutils';

const dummyRoute = {
  name: 'Route',
  key: '0',
};

jest.useFakeTimers({ advanceTimers: true });

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

describe('ReactNavigationInstrumentation', () => {
  let client: TestClient;
  let mockNavigation: ReturnType<typeof createMockNavigationAndAttachTo>;

  beforeEach(() => {
    RN_GLOBAL_OBJ.__sentry_rn_v5_registered = false;

    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();
  });

  test('transaction set on initialize', async () => {
    setupTestClient();
    jest.runOnlyPendingTimers(); // Flush the init transaction

    await client.flush();

    const actualEvent = client.event;
    expect(actualEvent).toEqual(expect.objectContaining({
      type: 'transaction',
      transaction: 'Initial Screen',
      contexts: expect.objectContaining({
        trace: expect.objectContaining({
          data: {
            [SEMANTIC_ATTRIBUTE_ROUTE_NAME]: 'Initial Screen',
            [SEMANTIC_ATTRIBUTE_ROUTE_KEY]: 'initial_screen',
            [SEMANTIC_ATTRIBUTE_ROUTE_HAS_BEEN_SEEN]: false,
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual',
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component', // Check why this was component
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
            [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
          },
        }),
      }),
    }));
  });

  test('transaction sent on navigation', async () => {
    setupTestClient();
    jest.runOnlyPendingTimers(); // Flush the init transaction

    mockNavigation.navigateToNewScreen();
    jest.runOnlyPendingTimers(); // Flush the navigation transaction

    await client.flush();

    const actualEvent = client.event;
    expect(actualEvent).toEqual(expect.objectContaining({
      type: 'transaction',
      transaction: 'New Screen',
      contexts: expect.objectContaining({
        trace: expect.objectContaining({
          data: {
            [SEMANTIC_ATTRIBUTE_ROUTE_NAME]: 'New Screen',
            [SEMANTIC_ATTRIBUTE_ROUTE_KEY]: 'new_screen',
            [SEMANTIC_ATTRIBUTE_ROUTE_HAS_BEEN_SEEN]: false,
            [SEMANTIC_ATTRIBUTE_PREVIOUS_ROUTE_NAME]: 'Initial Screen',
            [SEMANTIC_ATTRIBUTE_PREVIOUS_ROUTE_KEY]: 'initial_screen',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual',
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component', // Check why this was component
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
            [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
          },
        }),
      }),
    }));
  });

  test('transaction context changed with beforeNavigate', async () => {
    setupTestClient({
      beforeNavigate: span => {
        span.updateName('New Span Name');
      },
    });
    jest.runOnlyPendingTimers(); // Flush the init transaction

    mockNavigation.navigateToNewScreen();
    jest.runOnlyPendingTimers(); // Flush the navigation transaction

    await client.flush();

    const actualEvent = client.event;
    expect(actualEvent).toEqual(expect.objectContaining({
      type: 'transaction',
      transaction: 'New Span Name',
      contexts: expect.objectContaining({
        trace: expect.objectContaining({
          data: {
            [SEMANTIC_ATTRIBUTE_ROUTE_NAME]: 'New Screen',
            [SEMANTIC_ATTRIBUTE_ROUTE_KEY]: 'new_screen',
            [SEMANTIC_ATTRIBUTE_ROUTE_HAS_BEEN_SEEN]: false,
            [SEMANTIC_ATTRIBUTE_PREVIOUS_ROUTE_NAME]: 'Initial Screen',
            [SEMANTIC_ATTRIBUTE_PREVIOUS_ROUTE_KEY]: 'initial_screen',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual',
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component', // Check why this was component
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
            [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
          },
        }),
      }),
    }));
  });

  test('transaction not sent on a cancelled navigation', async () => {
    setupTestClient();
    jest.runOnlyPendingTimers(); // Flush the init transaction

    mockNavigation.emitCancelledNavigation();
    jest.runOnlyPendingTimers(); // Flush the cancelled navigation

    await client.flush();

    expect(client.eventQueue.length).toBe(1);
    expect(client.event).toEqual(expect.objectContaining({
      type: 'transaction',
      transaction: 'Initial Screen',
    }));
  });

  test('transaction not sent on multiple cancelled navigations', async () => {
    setupTestClient();
    jest.runOnlyPendingTimers(); // Flush the init transaction

    mockNavigation.emitCancelledNavigation();
    jest.runOnlyPendingTimers(); // Flush the cancelled navigation

    mockNavigation.emitCancelledNavigation();
    jest.runOnlyPendingTimers(); // Flush the cancelled navigation

    await client.flush();

    expect(client.eventQueue.length).toBe(1);
    expect(client.event).toEqual(expect.objectContaining({
      type: 'transaction',
      transaction: 'Initial Screen',
    }));
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

      const mockTransaction = new SentrySpan();
      const tracingListener = jest.fn(() => mockTransaction);
      instrumentation.registerRoutingInstrumentation(
        tracingListener as any,
        context => context,
        () => {},
      );

      await jest.runOnlyPendingTimersAsync();

      expect(mockTransaction['_sampled']).not.toBe(false);
    });
  });

  describe('options', () => {
    test('waits until routeChangeTimeoutMs', () => {
      const instrumentation = new ReactNavigationInstrumentation({
        routeChangeTimeoutMs: 200,
      });

      const mockTransaction = new SentrySpan({ sampled: true });
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
      mockNavigationContainerRef.current.listeners['__unsafe_action__']({});

      jest.advanceTimersByTime(190);

      expect(mockTransaction['_sampled']).toBe(true);
      expect(mockTransaction['_name']).toBe('Route');

      jest.advanceTimersByTime(20);

      expect(mockTransaction['_sampled']).toBe(false);
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

  function setupTestClient(setupOptions: {
    beforeNavigate?: BeforeNavigate;
  } = {}) {
    const rNavigation = new ReactNavigationInstrumentation({
      routeChangeTimeoutMs: 200,
    });
    mockNavigation = createMockNavigationAndAttachTo(rNavigation);

    const rnTracing = new ReactNativeTracing({
      routingInstrumentation: rNavigation,
      enableStallTracking: false,
      enableNativeFramesTracking: false,
      enableAppStartTracking: false,
      beforeNavigate: setupOptions.beforeNavigate,
    });

    const options = getDefaultTestClientOptions({
      tracesSampleRate: 1.0,
      integrations: [rnTracing],
    });
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();
  }
});
