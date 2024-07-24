/* eslint-disable deprecation/deprecation */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  addGlobalEventProcessor,
  getCurrentHub,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  setCurrentClient,
  Transaction,
} from '@sentry/core';

import { ReactNativeTracing } from '../../src/js';
import type { NavigationRoute } from '../../src/js/tracing/reactnavigation';
import { ReactNavigationInstrumentation } from '../../src/js/tracing/reactnavigation';
import type { BeforeNavigate } from '../../src/js/tracing/types';
import { RN_GLOBAL_OBJ } from '../../src/js/utils/worldwide';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';
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
    expect(actualEvent).toEqual(
      expect.objectContaining({
        type: 'transaction',
        transaction: 'Initial Screen',
        contexts: expect.objectContaining({
          trace: expect.objectContaining({
            data: {
              route: {
                hasBeenSeen: false,
                key: 'initial_screen',
                name: 'Initial Screen',
                params: {},
              },
              previousRoute: null,
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual',
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
              [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
            },
            op: 'navigation',
            origin: 'manual',
            tags: expect.objectContaining({
              'routing.instrumentation': 'react-navigation-v5',
              'routing.route.name': 'Initial Screen',
            }),
          }),
        }),
      }),
    );
  });

  test('transaction sent on navigation', async () => {
    setupTestClient();
    jest.runOnlyPendingTimers(); // Flush the init transaction

    mockNavigation.navigateToNewScreen();
    jest.runOnlyPendingTimers(); // Flush the navigation transaction

    await client.flush();

    const actualEvent = client.event;
    expect(actualEvent).toEqual(
      expect.objectContaining({
        type: 'transaction',
        transaction: 'New Screen',
        contexts: expect.objectContaining({
          trace: expect.objectContaining({
            data: {
              route: {
                hasBeenSeen: false,
                key: 'new_screen',
                name: 'New Screen',
                params: {},
              },
              previousRoute: {
                key: 'initial_screen',
                name: 'Initial Screen',
                params: {},
              },
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual',
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
              [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
            },
            op: 'navigation',
            origin: 'manual',
            tags: expect.objectContaining({
              'routing.instrumentation': 'react-navigation-v5',
              'routing.route.name': 'New Screen',
            }),
          }),
        }),
      }),
    );
  });

  test('transaction has correct metadata after multiple navigations', async () => {
    setupTestClient();
    jest.runOnlyPendingTimers(); // Flush the init transaction

    mockNavigation.navigateToNewScreen();
    jest.runOnlyPendingTimers(); // Flush the navigation transaction

    mockNavigation.navigateToSecondScreen();
    jest.runOnlyPendingTimers(); // Flush the navigation transaction

    await client.flush();

    const actualEvent = client.event;
    expect(actualEvent).toEqual(
      expect.objectContaining({
        type: 'transaction',
        transaction: 'Second Screen',
        contexts: expect.objectContaining({
          trace: expect.objectContaining({
            data: {
              route: {
                hasBeenSeen: false,
                key: 'second_screen',
                name: 'Second Screen',
                params: {},
              },
              previousRoute: {
                key: 'new_screen',
                name: 'New Screen',
                params: {},
              },
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual',
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
              [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
            },
            op: 'navigation',
            origin: 'manual',
            tags: expect.objectContaining({
              'routing.instrumentation': 'react-navigation-v5',
              'routing.route.name': 'Second Screen',
            }),
          }),
        }),
      }),
    );
  });

  test('transaction context changed with beforeNavigate', async () => {
    setupTestClient({
      beforeNavigate: span => {
        span.name = 'New Span Name';
        return span;
      },
    });
    jest.runOnlyPendingTimers(); // Flush the init transaction

    mockNavigation.navigateToNewScreen();
    jest.runOnlyPendingTimers(); // Flush the navigation transaction

    await client.flush();

    const actualEvent = client.event;
    expect(actualEvent).toEqual(
      expect.objectContaining({
        type: 'transaction',
        transaction: 'New Span Name',
        contexts: expect.objectContaining({
          trace: expect.objectContaining({
            data: {
              route: {
                hasBeenSeen: false,
                key: 'new_screen',
                name: 'New Screen',
                params: {},
              },
              previousRoute: {
                key: 'initial_screen',
                name: 'Initial Screen',
                params: {},
              },
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual',
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
              [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
            },
            op: 'navigation',
            origin: 'manual',
            tags: expect.objectContaining({
              'routing.instrumentation': 'react-navigation-v5',
              'routing.route.name': 'New Screen',
            }),
          }),
        }),
      }),
    );
  });

  test('transaction not sent on a cancelled navigation', async () => {
    setupTestClient();
    jest.runOnlyPendingTimers(); // Flush the init transaction

    mockNavigation.emitCancelledNavigation();
    jest.runOnlyPendingTimers(); // Flush the cancelled navigation

    await client.flush();

    expect(client.eventQueue.length).toBe(1);
    expect(client.event).toEqual(
      expect.objectContaining({
        type: 'transaction',
        transaction: 'Initial Screen',
      }),
    );
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
    expect(client.event).toEqual(
      expect.objectContaining({
        type: 'transaction',
        transaction: 'Initial Screen',
      }),
    );
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

      const mockTransaction = new Transaction({ name: 'Test' });
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

      const mockTransaction = new Transaction({ name: 'Test', sampled: true });
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

  function setupTestClient(
    setupOptions: {
      beforeNavigate?: BeforeNavigate;
    } = {},
  ) {
    const rNavigation = new ReactNavigationInstrumentation({
      routeChangeTimeoutMs: 200,
    });
    mockNavigation = createMockNavigationAndAttachTo(rNavigation);

    const rnTracing = new ReactNativeTracing({
      routingInstrumentation: rNavigation,
      enableStallTracking: false,
      enableNativeFramesTracking: false,
      enableAppStartTracking: false,
      beforeNavigate: setupOptions.beforeNavigate || (span => span),
    });

    const options = getDefaultTestClientOptions({
      tracesSampleRate: 1.0,
      integrations: [rnTracing],
    });
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();

    // We have to call this manually as setupOnce is executed once per runtime (global var check)
    rnTracing.setupOnce(addGlobalEventProcessor, getCurrentHub);
  }
});
