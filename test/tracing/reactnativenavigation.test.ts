/* eslint-disable @typescript-eslint/no-empty-function */
import {
  addGlobalEventProcessor,
  getActiveSpan,
  getCurrentHub,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  setCurrentClient,
  spanToJSON,
} from '@sentry/core';
import type { Event } from '@sentry/types';
import type { EmitterSubscription } from 'react-native';

import { ReactNativeTracing } from '../../src/js';
import type {
  BottomTabPressedEvent,
  ComponentWillAppearEvent,
  EventsRegistry,
} from '../../src/js/tracing/reactnativenavigation';
import { ReactNativeNavigationInstrumentation } from '../../src/js/tracing/reactnativenavigation';
import type { BeforeNavigate } from '../../src/js/tracing/types';
import { RN_GLOBAL_OBJ } from '../../src/js/utils/worldwide';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

interface MockEventsRegistry extends EventsRegistry {
  componentWillAppearListener?: (event: ComponentWillAppearEvent) => void;
  commandListener?: (name: string, params: unknown) => void;
  bottomTabPressedListener?: (event: BottomTabPressedEvent) => void;
  onComponentWillAppear(event: ComponentWillAppearEvent): void;
  onCommand(name: string, params: unknown): void;
  onBottomTabPressed(event: BottomTabPressedEvent): void;
}

jest.useFakeTimers({ advanceTimers: true });

describe('React Native Navigation Instrumentation', () => {
  let mockEventsRegistry: MockEventsRegistry;
  let client: TestClient;

  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();
    RN_GLOBAL_OBJ.__SENTRY__.globalEventProcessors = []; // resets integrations
  });

  test('Correctly instruments a route change', async () => {
    setupTestClient();

    const mockEvent: ComponentWillAppearEvent = {
      componentId: '0',
      componentName: 'Test',
      componentType: 'Component',
      passProps: {},
    };

    mockEventsRegistry.onCommand('root', {});
    mockEventsRegistry.onComponentWillAppear(mockEvent);

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    expect(client.event).toEqual(
      expect.objectContaining({
        type: 'transaction',
        transaction: 'Test',
        contexts: expect.objectContaining({
          trace: expect.objectContaining({
            data: {
              route: {
                name: 'Test',
                componentName: 'Test',
                componentId: '0',
                componentType: 'Component',
                hasBeenSeen: false,
                passProps: {},
              },
              previousRoute: null,
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual',
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
              [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
            },
          }),
        }),
      }),
    );
  });

  test('Transaction context is changed with beforeNavigate', async () => {
    setupTestClient({
      beforeNavigate: span => {
        span.name = 'New Name';
        return span;
      },
    });

    const mockEvent: ComponentWillAppearEvent = {
      componentId: '0',
      componentName: 'Test',
      componentType: 'Component',
      passProps: {},
    };

    mockEventsRegistry.onCommand('root', {});
    mockEventsRegistry.onComponentWillAppear(mockEvent);

    await jest.runOnlyPendingTimersAsync();
    await client.flush();

    expect(client.event).toEqual(
      expect.objectContaining(<Partial<Event>>{
        type: 'transaction',
        transaction: 'New Name',
        contexts: expect.objectContaining({
          trace: expect.objectContaining({
            data: {
              route: {
                name: 'Test',
                componentName: 'Test',
                componentId: '0',
                componentType: 'Component',
                hasBeenSeen: false,
                passProps: {},
              },
              previousRoute: null,
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual',
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
              [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
            },
          }),
        }),
      }),
    );
  });

  test('Transaction not sent on a cancelled route change', async () => {
    setupTestClient();

    mockEventsRegistry.onCommand('root', {});

    await jest.runAllTimersAsync();
    await client.flush();

    expect(client.event).toBeUndefined();
  });

  test('Transaction not sent if route change timeout is passed', async () => {
    setupTestClient();

    mockEventsRegistry.onCommand('root', {});

    expect(spanToJSON(getActiveSpan()!).description).toEqual('Route Change');
    expect(getActiveSpan()!.isRecording()).toBe(true);

    await jest.runAllTimersAsync();

    const mockEvent: ComponentWillAppearEvent = {
      componentId: '0',
      componentName: 'Test',
      componentType: 'Component',
      passProps: {},
    };
    mockEventsRegistry.onComponentWillAppear(mockEvent);

    await jest.runAllTimersAsync();
    await client.flush();

    expect(client.event).toBeUndefined();
  });

  describe('tab change', () => {
    test('correctly instruments a tab change', async () => {
      setupTestClient({
        enableTabsInstrumentation: true,
      });

      mockEventsRegistry.onBottomTabPressed({ tabIndex: 0 });
      mockEventsRegistry.onComponentWillAppear(<ComponentWillAppearEvent>{
        componentId: '0',
        componentName: 'TestScreenName',
        componentType: 'Component',
        passProps: {},
      });

      await jest.runOnlyPendingTimersAsync();
      await client.flush();

      expect(client.event).toEqual(
        expect.objectContaining(<Partial<Event>>{
          type: 'transaction',
          transaction: 'TestScreenName',
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              data: {
                route: {
                  name: 'TestScreenName',
                  componentName: 'TestScreenName',
                  componentId: '0',
                  componentType: 'Component',
                  hasBeenSeen: false,
                  passProps: {},
                },
                previousRoute: null,
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual',
                [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
                [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
              },
            }),
          }),
        }),
      );
    });

    test('not instrument tabs if disabled', async () => {
      setupTestClient({
        enableTabsInstrumentation: false,
      });

      mockEventsRegistry.onBottomTabPressed({ tabIndex: 0 });
      mockEventsRegistry.onComponentWillAppear(<ComponentWillAppearEvent>{
        componentId: '0',
        componentName: 'TestScreenName',
        componentType: 'Component',
      });

      await jest.runOnlyPendingTimersAsync();
      await client.flush();

      expect(client.event).toBeUndefined();
    });

    test('tabs instrumentation is disabled by default', async () => {
      setupTestClient();

      mockEventsRegistry.onBottomTabPressed({ tabIndex: 0 });
      mockEventsRegistry.onComponentWillAppear(<ComponentWillAppearEvent>{
        componentId: '0',
        componentName: 'TestScreenName',
        componentType: 'Component',
      });

      await jest.runOnlyPendingTimersAsync();
      await client.flush();

      expect(client.event).toBeUndefined();
    });
  });

  describe('onRouteConfirmed', () => {
    test('onRouteConfirmed called with correct route data', async () => {
      setupTestClient();

      const mockEvent1: ComponentWillAppearEvent = {
        componentId: '1',
        componentName: 'Test 1',
        componentType: 'Component',
        passProps: {},
      };
      const mockEvent2: ComponentWillAppearEvent = {
        componentId: '2',
        componentName: 'Test 2',
        componentType: 'Component',
        passProps: {},
      };

      mockEventsRegistry.onCommand('root', {});
      mockEventsRegistry.onComponentWillAppear(mockEvent1);

      mockEventsRegistry.onCommand('root', {});
      mockEventsRegistry.onComponentWillAppear(mockEvent2);

      await jest.runOnlyPendingTimersAsync();
      await client.flush();

      expect(client.eventQueue.length).toEqual(2);
      expect(client.event).toEqual(
        expect.objectContaining(<Partial<Event>>{
          type: 'transaction',
          transaction: 'Test 2',
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              data: {
                route: {
                  name: 'Test 2',
                  componentName: 'Test 2',
                  componentId: '2',
                  componentType: 'Component',
                  hasBeenSeen: false,
                  passProps: {},
                },
                previousRoute: {
                  name: 'Test 1',
                  componentName: 'Test 1',
                  componentId: '1',
                  componentType: 'Component',
                  passProps: {},
                },
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual',
                [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
                [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
              },
            }),
          }),
        }),
      );
    });

    test('onRouteConfirmed clears transaction', async () => {
      setupTestClient();

      const mockEvent1: ComponentWillAppearEvent = {
        componentId: '1',
        componentName: 'Test 1',
        componentType: 'Component',
        passProps: {},
      };
      const mockEvent2: ComponentWillAppearEvent = {
        componentId: '2',
        componentName: 'Test 2',
        componentType: 'Component',
        passProps: {},
      };

      mockEventsRegistry.onCommand('root', {});
      mockEventsRegistry.onComponentWillAppear(mockEvent1);

      mockEventsRegistry.onComponentWillAppear(mockEvent2);

      await jest.runOnlyPendingTimersAsync();
      await client.flush();

      expect(client.eventQueue.length).toEqual(1);
      expect(client.event).toEqual(
        expect.objectContaining(<Partial<Event>>{
          type: 'transaction',
          transaction: 'Test 1',
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              data: {
                route: {
                  name: 'Test 1',
                  componentName: 'Test 1',
                  componentId: '1',
                  componentType: 'Component',
                  hasBeenSeen: false,
                  passProps: {},
                },
                previousRoute: null,
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual',
                [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
                [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
              },
            }),
          }),
        }),
      );
    });
  });

  function setupTestClient(
    setupOptions: {
      beforeNavigate?: BeforeNavigate;
      enableTabsInstrumentation?: boolean;
    } = {},
  ) {
    createMockNavigation();
    const rNavigation = new ReactNativeNavigationInstrumentation(
      {
        events() {
          return mockEventsRegistry;
        },
      },
      {
        routeChangeTimeoutMs: 200,
        enableTabsInstrumentation: setupOptions.enableTabsInstrumentation,
      },
    );

    const rnTracing = new ReactNativeTracing({
      routingInstrumentation: rNavigation,
      enableStallTracking: false,
      enableNativeFramesTracking: false,
      beforeNavigate: setupOptions.beforeNavigate || (span => span),
    });

    const options = getDefaultTestClientOptions({
      enableAppStartTracking: false,
      tracesSampleRate: 1.0,
      integrations: [rnTracing],
    });
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();

    rnTracing.setupOnce(addGlobalEventProcessor, getCurrentHub);
  }

  function createMockNavigation() {
    mockEventsRegistry = {
      onComponentWillAppear(event: ComponentWillAppearEvent): void {
        this.componentWillAppearListener?.(event);
      },
      onCommand(name: string, params: unknown): void {
        this.commandListener?.(name, params);
      },
      onBottomTabPressed(event) {
        this.bottomTabPressedListener?.(event);
      },
      registerComponentWillAppearListener(callback: (event: ComponentWillAppearEvent) => void) {
        this.componentWillAppearListener = callback;
        return {
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          remove() {},
        } as EmitterSubscription;
      },
      registerCommandListener(callback: (name: string, params: unknown) => void) {
        this.commandListener = callback;
        return {
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          remove() {},
        };
      },
      registerBottomTabPressedListener(callback: (event: BottomTabPressedEvent) => void) {
        this.bottomTabPressedListener = callback;
        return {
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          remove() {},
        } as EmitterSubscription;
      },
    };
  }
});
