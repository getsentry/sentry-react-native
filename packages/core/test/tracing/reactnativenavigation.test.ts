/* eslint-disable @typescript-eslint/no-empty-function */
import type { Event, StartSpanOptions } from '@sentry/core';
import {
  getActiveSpan,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  setCurrentClient,
  spanToJSON,
} from '@sentry/core';
import type { EmitterSubscription } from 'react-native';

import { reactNativeTracingIntegration } from '../../src/js';
import { SPAN_ORIGIN_AUTO_NAVIGATION_REACT_NATIVE_NAVIGATION } from '../../src/js/tracing/origin';
import type {
  BottomTabPressedEvent,
  ComponentWillAppearEvent,
  EventsRegistry,
} from '../../src/js/tracing/reactnativenavigation';
import { reactNativeNavigationIntegration } from '../../src/js/tracing/reactnativenavigation';
import {
  SEMANTIC_ATTRIBUTE_PREVIOUS_ROUTE_COMPONENT_ID,
  SEMANTIC_ATTRIBUTE_PREVIOUS_ROUTE_COMPONENT_TYPE,
  SEMANTIC_ATTRIBUTE_PREVIOUS_ROUTE_NAME,
  SEMANTIC_ATTRIBUTE_ROUTE_COMPONENT_ID,
  SEMANTIC_ATTRIBUTE_ROUTE_COMPONENT_TYPE,
  SEMANTIC_ATTRIBUTE_ROUTE_HAS_BEEN_SEEN,
  SEMANTIC_ATTRIBUTE_ROUTE_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '../../src/js/tracing/semanticAttributes';
import { SPAN_THREAD_NAME, SPAN_THREAD_NAME_JAVASCRIPT } from '../../src/js/tracing/span';
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
              [SEMANTIC_ATTRIBUTE_ROUTE_NAME]: 'Test',
              [SEMANTIC_ATTRIBUTE_ROUTE_COMPONENT_ID]: '0',
              [SEMANTIC_ATTRIBUTE_ROUTE_COMPONENT_TYPE]: 'Component',
              [SEMANTIC_ATTRIBUTE_ROUTE_HAS_BEEN_SEEN]: false,
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_NAVIGATION_REACT_NATIVE_NAVIGATION,
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
              [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
              [SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON]: 'idleTimeout',
              [SPAN_THREAD_NAME]: SPAN_THREAD_NAME_JAVASCRIPT,
            },
          }),
        }),
      }),
    );
  });

  test('start span options are changes by before start span callback', async () => {
    setupTestClient({
      beforeStartSpan: startSpanOptions => {
        startSpanOptions.name = 'New Name';
        return startSpanOptions;
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
              [SEMANTIC_ATTRIBUTE_ROUTE_NAME]: 'Test',
              [SEMANTIC_ATTRIBUTE_ROUTE_COMPONENT_ID]: '0',
              [SEMANTIC_ATTRIBUTE_ROUTE_COMPONENT_TYPE]: 'Component',
              [SEMANTIC_ATTRIBUTE_ROUTE_HAS_BEEN_SEEN]: false,
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_NAVIGATION_REACT_NATIVE_NAVIGATION,
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
              [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
              [SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON]: 'idleTimeout',
              [SPAN_THREAD_NAME]: SPAN_THREAD_NAME_JAVASCRIPT,
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
                [SEMANTIC_ATTRIBUTE_ROUTE_NAME]: 'TestScreenName',
                [SEMANTIC_ATTRIBUTE_ROUTE_COMPONENT_ID]: '0',
                [SEMANTIC_ATTRIBUTE_ROUTE_COMPONENT_TYPE]: 'Component',
                [SEMANTIC_ATTRIBUTE_ROUTE_HAS_BEEN_SEEN]: false,
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_NAVIGATION_REACT_NATIVE_NAVIGATION,
                [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
                [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
                [SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON]: 'idleTimeout',
                [SPAN_THREAD_NAME]: SPAN_THREAD_NAME_JAVASCRIPT,
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
                [SEMANTIC_ATTRIBUTE_ROUTE_NAME]: 'Test 2',
                [SEMANTIC_ATTRIBUTE_ROUTE_COMPONENT_ID]: '2',
                [SEMANTIC_ATTRIBUTE_ROUTE_COMPONENT_TYPE]: 'Component',
                [SEMANTIC_ATTRIBUTE_ROUTE_HAS_BEEN_SEEN]: false,
                [SEMANTIC_ATTRIBUTE_PREVIOUS_ROUTE_NAME]: 'Test 1',
                [SEMANTIC_ATTRIBUTE_PREVIOUS_ROUTE_COMPONENT_ID]: '1',
                [SEMANTIC_ATTRIBUTE_PREVIOUS_ROUTE_COMPONENT_TYPE]: 'Component',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_NAVIGATION_REACT_NATIVE_NAVIGATION,
                [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
                [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
                [SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON]: 'idleTimeout',
                [SPAN_THREAD_NAME]: SPAN_THREAD_NAME_JAVASCRIPT,
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
                [SEMANTIC_ATTRIBUTE_ROUTE_NAME]: 'Test 1',
                [SEMANTIC_ATTRIBUTE_ROUTE_COMPONENT_ID]: '1',
                [SEMANTIC_ATTRIBUTE_ROUTE_COMPONENT_TYPE]: 'Component',
                [SEMANTIC_ATTRIBUTE_ROUTE_HAS_BEEN_SEEN]: false,
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_NAVIGATION_REACT_NATIVE_NAVIGATION,
                [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
                [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
                [SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON]: 'idleTimeout',
                [SPAN_THREAD_NAME]: SPAN_THREAD_NAME_JAVASCRIPT,
              },
            }),
          }),
        }),
      );
    });
  });

  function setupTestClient(
    setupOptions: {
      beforeStartSpan?: (options: StartSpanOptions) => StartSpanOptions;
      enableTabsInstrumentation?: boolean;
    } = {},
  ) {
    createMockNavigation();
    const rNavigation = reactNativeNavigationIntegration({
      navigation: {
        events() {
          return mockEventsRegistry;
        },
      },
      routeChangeTimeoutMs: 200,
      enableTabsInstrumentation: setupOptions.enableTabsInstrumentation,
    });

    const rnTracing = reactNativeTracingIntegration({
      beforeStartSpan: setupOptions.beforeStartSpan,
    });

    const options = getDefaultTestClientOptions({
      tracesSampleRate: 1.0,
      enableStallTracking: false,
      enableNativeFramesTracking: false,
      integrations: [rNavigation, rnTracing],
      enableAppStartTracking: false,
    });
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();
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
