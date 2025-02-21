/* eslint-disable deprecation/deprecation */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SentrySpan } from '@sentry/core';
import type { Event, Measurements, StartSpanOptions } from '@sentry/core';
import { getActiveSpan, getCurrentScope, getGlobalScope, getIsolationScope, setCurrentClient } from '@sentry/core';

import { nativeFramesIntegration, reactNativeTracingIntegration } from '../../src/js';
import { SPAN_ORIGIN_AUTO_NAVIGATION_REACT_NAVIGATION } from '../../src/js/tracing/origin';
import type { NavigationRoute } from '../../src/js/tracing/reactnavigation';
import { reactNavigationIntegration } from '../../src/js/tracing/reactnavigation';
import {
  SEMANTIC_ATTRIBUTE_PREVIOUS_ROUTE_KEY,
  SEMANTIC_ATTRIBUTE_PREVIOUS_ROUTE_NAME,
  SEMANTIC_ATTRIBUTE_ROUTE_HAS_BEEN_SEEN,
  SEMANTIC_ATTRIBUTE_ROUTE_KEY,
  SEMANTIC_ATTRIBUTE_ROUTE_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '../../src/js/tracing/semanticAttributes';
import {
  DEFAULT_NAVIGATION_SPAN_NAME,
  SPAN_THREAD_ID,
  SPAN_THREAD_ID_JAVASCRIPT,
  SPAN_THREAD_NAME,
  SPAN_THREAD_NAME_JAVASCRIPT,
} from '../../src/js/tracing/span';
import { RN_GLOBAL_OBJ } from '../../src/js/utils/worldwide';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';
import { NATIVE } from '../mockWrapper';
import { getDevServer } from './../../src/js/integrations/debugsymbolicatorutils';
import { createMockNavigationAndAttachTo } from './reactnavigationutils';

const dummyRoute = {
  name: 'Route',
  key: '0',
};

jest.mock('../../src/js/wrapper.ts', () => jest.requireActual('../mockWrapper.ts'));
jest.mock('./../../src/js/integrations/debugsymbolicatorutils', () => ({
  getDevServer: jest.fn(),
}));
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
              [SEMANTIC_ATTRIBUTE_ROUTE_NAME]: 'Initial Screen',
              [SEMANTIC_ATTRIBUTE_ROUTE_KEY]: 'initial_screen',
              [SEMANTIC_ATTRIBUTE_ROUTE_HAS_BEEN_SEEN]: false,
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_NAVIGATION_REACT_NAVIGATION,
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
              [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
              [SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON]: 'idleTimeout',
              [SPAN_THREAD_ID]: SPAN_THREAD_ID_JAVASCRIPT,
              [SPAN_THREAD_NAME]: SPAN_THREAD_NAME_JAVASCRIPT,
            },
          }),
        }),
      }),
    );
  });

  describe('initial navigation span is created after all integrations are setup', () => {
    let reactNavigation: ReturnType<typeof reactNavigationIntegration>;

    beforeEach(() => {
      const startFrames = {
        totalFrames: 100,
        slowFrames: 20,
        frozenFrames: 5,
      };
      const finishFrames = {
        totalFrames: 200,
        slowFrames: 40,
        frozenFrames: 10,
      };
      NATIVE.fetchNativeFrames.mockResolvedValueOnce(startFrames).mockResolvedValueOnce(finishFrames);

      reactNavigation = reactNavigationIntegration({
        routeChangeTimeoutMs: 200,
      });
      mockNavigation = createMockNavigationAndAttachTo(reactNavigation);
    });

    test('initial navigation span contains native frames when nativeFrames integration is after react native tracing', async () => {
      const options = getDefaultTestClientOptions({
        enableNativeFramesTracking: true,
        enableStallTracking: false,
        tracesSampleRate: 1.0,
        integrations: [reactNavigation, nativeFramesIntegration()],
        enableAppStartTracking: false,
      });
      client = new TestClient(options);
      setCurrentClient(client);
      client.init();

      // Flush the init transaction, must be async to allow for the native start frames to be fetched
      await jest.runOnlyPendingTimersAsync();
      await client.flush();

      expectInitNavigationSpanWithNativeFrames(client.event);
    });

    test('initial navigation span contains native frames when nativeFrames integration is before react native tracing', async () => {
      const options = getDefaultTestClientOptions({
        enableNativeFramesTracking: true,
        enableStallTracking: false,
        tracesSampleRate: 1.0,
        integrations: [nativeFramesIntegration(), reactNavigation],
        enableAppStartTracking: false,
      });
      client = new TestClient(options);
      setCurrentClient(client);
      client.init();

      // Flush the init transaction, must be async to allow for the native start frames to be fetched
      await jest.runOnlyPendingTimersAsync();
      await client.flush();

      expectInitNavigationSpanWithNativeFrames(client.event);
    });

    function expectInitNavigationSpanWithNativeFrames(event: Event): void {
      expect(event).toEqual(
        expect.objectContaining<Event>({
          type: 'transaction',
          transaction: 'Initial Screen',
          measurements: expect.objectContaining<Measurements>({
            frames_total: expect.toBeObject(),
            frames_slow: expect.toBeObject(),
            frames_frozen: expect.toBeObject(),
          }),
        }),
      );
    }
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
              [SEMANTIC_ATTRIBUTE_ROUTE_NAME]: 'New Screen',
              [SEMANTIC_ATTRIBUTE_ROUTE_KEY]: 'new_screen',
              [SEMANTIC_ATTRIBUTE_ROUTE_HAS_BEEN_SEEN]: false,
              [SEMANTIC_ATTRIBUTE_PREVIOUS_ROUTE_NAME]: 'Initial Screen',
              [SEMANTIC_ATTRIBUTE_PREVIOUS_ROUTE_KEY]: 'initial_screen',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_NAVIGATION_REACT_NAVIGATION,
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
              [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
              [SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON]: 'idleTimeout',
              [SPAN_THREAD_ID]: SPAN_THREAD_ID_JAVASCRIPT,
              [SPAN_THREAD_NAME]: SPAN_THREAD_NAME_JAVASCRIPT,
            },
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
              [SEMANTIC_ATTRIBUTE_ROUTE_NAME]: 'Second Screen',
              [SEMANTIC_ATTRIBUTE_ROUTE_KEY]: 'second_screen',
              [SEMANTIC_ATTRIBUTE_ROUTE_HAS_BEEN_SEEN]: false,
              [SEMANTIC_ATTRIBUTE_PREVIOUS_ROUTE_NAME]: 'New Screen',
              [SEMANTIC_ATTRIBUTE_PREVIOUS_ROUTE_KEY]: 'new_screen',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_NAVIGATION_REACT_NAVIGATION,
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
              [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
              [SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON]: 'idleTimeout',
              [SPAN_THREAD_ID]: SPAN_THREAD_ID_JAVASCRIPT,
              [SPAN_THREAD_NAME]: SPAN_THREAD_NAME_JAVASCRIPT,
            },
          }),
        }),
      }),
    );
  });

  test('start span option changed in before start span callback', async () => {
    setupTestClient({
      beforeSpanStart: startSpanOption => {
        startSpanOption.name = 'New Span Name';
        return startSpanOption;
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
              [SEMANTIC_ATTRIBUTE_ROUTE_NAME]: 'New Screen',
              [SEMANTIC_ATTRIBUTE_ROUTE_KEY]: 'new_screen',
              [SEMANTIC_ATTRIBUTE_ROUTE_HAS_BEEN_SEEN]: false,
              [SEMANTIC_ATTRIBUTE_PREVIOUS_ROUTE_NAME]: 'Initial Screen',
              [SEMANTIC_ATTRIBUTE_PREVIOUS_ROUTE_KEY]: 'initial_screen',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_NAVIGATION_REACT_NAVIGATION,
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
              [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
              [SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON]: 'idleTimeout',
              [SPAN_THREAD_ID]: SPAN_THREAD_ID_JAVASCRIPT,
              [SPAN_THREAD_NAME]: SPAN_THREAD_NAME_JAVASCRIPT,
            },
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
      const instrumentation = reactNavigationIntegration();
      const mockNavigationContainer = new MockNavigationContainer();
      instrumentation.registerNavigationContainer({
        current: mockNavigationContainer,
      });

      expect(RN_GLOBAL_OBJ.__sentry_rn_v5_registered).toBe(true);

      expect(mockNavigationContainer.addListener).toHaveBeenNthCalledWith(1, '__unsafe_action__', expect.any(Function));
      expect(mockNavigationContainer.addListener).toHaveBeenNthCalledWith(2, 'state', expect.any(Function));
    });

    test('registers navigation container direct ref', () => {
      const instrumentation = reactNavigationIntegration();
      const mockNavigationContainer = new MockNavigationContainer();
      instrumentation.registerNavigationContainer(mockNavigationContainer);

      expect(RN_GLOBAL_OBJ.__sentry_rn_v5_registered).toBe(true);

      expect(mockNavigationContainer.addListener).toHaveBeenNthCalledWith(1, '__unsafe_action__', expect.any(Function));
      expect(mockNavigationContainer.addListener).toHaveBeenNthCalledWith(2, 'state', expect.any(Function));
    });

    test('does not register navigation container if there is an existing one', () => {
      RN_GLOBAL_OBJ.__sentry_rn_v5_registered = true;

      const instrumentation = reactNavigationIntegration();
      const mockNavigationContainer = new MockNavigationContainer();
      instrumentation.registerNavigationContainer({
        current: mockNavigationContainer,
      });

      expect(RN_GLOBAL_OBJ.__sentry_rn_v5_registered).toBe(true);

      expect(mockNavigationContainer.addListener).not.toHaveBeenCalled();
      expect(mockNavigationContainer.addListener).not.toHaveBeenCalled();
    });

    test('works if routing instrumentation setup is after navigation registration', async () => {
      const instrumentation = reactNavigationIntegration();

      const mockNavigationContainer = new MockNavigationContainer();
      instrumentation.registerNavigationContainer(mockNavigationContainer);

      instrumentation.afterAllSetup(client);
      const mockTransaction = getActiveSpan() as SentrySpan;

      await jest.runOnlyPendingTimersAsync();

      expect(mockTransaction['_sampled']).not.toBe(false);
    });
  });

  describe('options', () => {
    test('waits until routeChangeTimeoutMs', () => {
      const instrumentation = reactNavigationIntegration({
        routeChangeTimeoutMs: 200,
      });

      instrumentation.afterAllSetup(client);

      const mockNavigationContainerRef = {
        current: new MockNavigationContainer(),
      };

      instrumentation.registerNavigationContainer(mockNavigationContainerRef as any);
      mockNavigationContainerRef.current.listeners['__unsafe_action__']({});
      const mockTransaction = getActiveSpan() as SentrySpan;

      jest.advanceTimersByTime(190);

      expect(mockTransaction['_sampled']).toBe(true);
      expect(mockTransaction['_name']).toBe(DEFAULT_NAVIGATION_SPAN_NAME);

      jest.advanceTimersByTime(20);

      expect(mockTransaction['_sampled']).toBe(false);
    });
  });

  describe('shouldCreateSpanForRequest', () => {
    it('should return false for Dev Server URLs', () => {
      const devServerUrl = 'http://localhost:8081';
      (getDevServer as jest.Mock).mockReturnValue({ url: devServerUrl });

      const rnTracing = reactNativeTracingIntegration();

      const result = rnTracing.options.shouldCreateSpanForRequest(devServerUrl);

      expect(result).toBe(false);
    });

    it('should return true for non Dev Server URLs', () => {
      const devServerUrl = 'http://localhost:8081';
      (getDevServer as jest.Mock).mockReturnValue({ url: devServerUrl });

      const rnTracing = reactNativeTracingIntegration();

      const result = rnTracing.options.shouldCreateSpanForRequest('http://some-other-url.com');

      expect(result).toBe(true);
    });

    it('should chain the user defined shouldCreateSpanForRequest if defined', () => {
      const devServerUrl = 'http://localhost:8081';
      (getDevServer as jest.Mock).mockReturnValue({ url: devServerUrl });

      const userShouldCreateSpanForRequest = (_url: string): boolean => {
        return false;
      };

      const rnTracing = reactNativeTracingIntegration({ shouldCreateSpanForRequest: userShouldCreateSpanForRequest });

      const result = rnTracing.options.shouldCreateSpanForRequest('http://some-other-url.com');

      expect(result).toBe(false);
    });

    it('should handle undefined devServerUrls by using only the user defined shouldCreateSpanForRequest', () => {
      (getDevServer as jest.Mock).mockReturnValue({ url: undefined });

      const userShouldCreateSpanForRequest = (_url: string): boolean => {
        return true;
      };

      const rnTracing = reactNativeTracingIntegration({ shouldCreateSpanForRequest: userShouldCreateSpanForRequest });

      const result = rnTracing.options.shouldCreateSpanForRequest('http://any-url.com');

      expect(result).toBe(true);
    });

    it('should not set the shouldCreateSpanForRequest if not user provided and the devServerUrl is undefined', () => {
      (getDevServer as jest.Mock).mockReturnValue({ url: undefined });

      const rnTracing = reactNativeTracingIntegration();

      expect(rnTracing.options.shouldCreateSpanForRequest).toBe(undefined);
    });
  });

  function setupTestClient(
    setupOptions: {
      beforeSpanStart?: (options: StartSpanOptions) => StartSpanOptions;
    } = {},
  ) {
    const rNavigation = reactNavigationIntegration({
      routeChangeTimeoutMs: 200,
    });
    mockNavigation = createMockNavigationAndAttachTo(rNavigation);

    const rnTracing = reactNativeTracingIntegration({
      beforeStartSpan: setupOptions.beforeSpanStart,
    });

    const options = getDefaultTestClientOptions({
      enableNativeFramesTracking: false,
      enableStallTracking: false,
      tracesSampleRate: 1.0,
      integrations: [rNavigation, rnTracing],
      enableAppStartTracking: false,
    });
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();
  }
});
