import type { Event, Measurements, SentrySpan, StartSpanOptions } from '@sentry/core';

import {
  getActiveSpan,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  setCurrentClient,
  spanToJSON,
} from '@sentry/core';

import type { NavigationRoute } from '../../src/js/tracing/reactnavigation';

import { nativeFramesIntegration, reactNativeTracingIntegration } from '../../src/js';
import { SPAN_ORIGIN_AUTO_NAVIGATION_REACT_NAVIGATION } from '../../src/js/tracing/origin';
import { extractDynamicRouteParams, reactNavigationIntegration } from '../../src/js/tracing/reactnavigation';
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
import { DEFAULT_NAVIGATION_SPAN_NAME, SPAN_THREAD_NAME, SPAN_THREAD_NAME_JAVASCRIPT } from '../../src/js/tracing/span';
import { RN_GLOBAL_OBJ } from '../../src/js/utils/worldwide';
import { mockAppRegistryIntegration } from '../mocks/appRegistryIntegrationMock';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';
import { NATIVE } from '../mockWrapper';
import { getDevServer } from './../../src/js/integrations/debugsymbolicatorutils';
import { createMockNavigationAndAttachTo, createMockNavigationWithNestedState } from './reactnavigationutils';

const dummyRoute = {
  name: 'Route',
  key: '0',
};

jest.mock('../../src/js/wrapper.ts', () => jest.requireActual('../mockWrapper.ts'));
jest.mock('./../../src/js/integrations/debugsymbolicatorutils', () => ({
  getDevServer: jest.fn(),
}));
jest.useFakeTimers({
  advanceTimers: true,
  doNotFake: ['performance'], // Keep real performance API
});

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

describe('extractDynamicRouteParams', () => {
  it('returns undefined when params is undefined', () => {
    expect(extractDynamicRouteParams('profile/[id]', undefined)).toBeUndefined();
  });

  it('returns undefined when route name has no dynamic segments', () => {
    expect(extractDynamicRouteParams('StaticScreen', { foo: 'bar' })).toBeUndefined();
  });

  it('extracts single dynamic segment [id]', () => {
    expect(extractDynamicRouteParams('profile/[id]', { id: '123' })).toEqual({
      'route.params.id': '123',
    });
  });

  it('extracts catch-all segment [...slug] and joins array values with /', () => {
    expect(extractDynamicRouteParams('posts/[...slug]', { slug: ['tech', 'react-native'] })).toEqual({
      'route.params.slug': 'tech/react-native',
    });
  });

  it('extracts multiple dynamic segments', () => {
    expect(
      extractDynamicRouteParams('[org]/[project]/issues/[id]', { org: 'sentry', project: 'react-native', id: '42' }),
    ).toEqual({
      'route.params.org': 'sentry',
      'route.params.project': 'react-native',
      'route.params.id': '42',
    });
  });

  it('ignores params not matching dynamic segments', () => {
    expect(extractDynamicRouteParams('profile/[id]', { id: '123', utm_source: 'email' })).toEqual({
      'route.params.id': '123',
    });
  });

  it('returns undefined when dynamic segment key is missing from params', () => {
    expect(extractDynamicRouteParams('profile/[id]', { name: 'test' })).toBeUndefined();
  });

  it('converts non-string param values to strings', () => {
    expect(extractDynamicRouteParams('items/[count]', { count: 42 })).toEqual({
      'route.params.count': '42',
    });
  });
});

describe('ReactNavigationInstrumentation', () => {
  let client: TestClient;
  let mockNavigation: ReturnType<typeof createMockNavigationAndAttachTo>;

  beforeEach(() => {
    jest.clearAllMocks();
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

  test('empty Route Change transaction is not sent when route is undefined', async () => {
    setupTestClient();
    jest.runOnlyPendingTimers(); // Flush the init transaction

    mockNavigation.emitNavigationWithUndefinedRoute();
    jest.runOnlyPendingTimers(); // Flush the empty route change transaction

    await client.flush();

    // Only the initial transaction should be sent
    expect(client.eventQueue.length).toBe(1);
    expect(client.event).toEqual(
      expect.objectContaining({
        type: 'transaction',
        transaction: 'Initial Screen',
      }),
    );
  });

  test('empty Route Change transaction is recorded as dropped', async () => {
    const mockRecordDroppedEvent = jest.fn();
    setupTestClient();
    client.recordDroppedEvent = mockRecordDroppedEvent;
    jest.runOnlyPendingTimers(); // Flush the init transaction

    mockNavigation.emitNavigationWithUndefinedRoute();
    jest.runOnlyPendingTimers(); // Flush the empty route change transaction

    await client.flush();

    // Should have recorded a dropped transaction
    expect(mockRecordDroppedEvent).toHaveBeenCalledWith('sample_rate', 'transaction');
  });

  test('empty Route Change transaction is not sent after multiple undefined routes', async () => {
    setupTestClient();
    jest.runOnlyPendingTimers(); // Flush the init transaction

    mockNavigation.emitNavigationWithUndefinedRoute();
    jest.runOnlyPendingTimers(); // Flush the first empty route change transaction

    mockNavigation.emitNavigationWithUndefinedRoute();
    jest.runOnlyPendingTimers(); // Flush the second empty route change transaction

    await client.flush();

    // Only the initial transaction should be sent
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

      expect(mockNavigationContainer.addListener).toHaveBeenCalledTimes(2);
      expect(mockNavigationContainer.addListener).toHaveBeenNthCalledWith(1, '__unsafe_action__', expect.any(Function));
      expect(mockNavigationContainer.addListener).toHaveBeenNthCalledWith(2, 'state', expect.any(Function));
    });

    test('registers navigation container direct ref', () => {
      const instrumentation = reactNavigationIntegration();
      const mockNavigationContainer = new MockNavigationContainer();
      instrumentation.registerNavigationContainer(mockNavigationContainer);

      expect(RN_GLOBAL_OBJ.__sentry_rn_v5_registered).toBe(true);

      expect(mockNavigationContainer.addListener).toHaveBeenCalledTimes(2);
      expect(mockNavigationContainer.addListener).toHaveBeenNthCalledWith(1, '__unsafe_action__', expect.any(Function));
      expect(mockNavigationContainer.addListener).toHaveBeenNthCalledWith(2, 'state', expect.any(Function));
    });

    test('does not register navigation container if the existing one is already registered', () => {
      const instrumentation = reactNavigationIntegration();

      const mockNavigationContainer = new MockNavigationContainer();
      instrumentation.registerNavigationContainer({
        current: mockNavigationContainer,
      });

      // Clear mocks after the first registration
      jest.clearAllMocks();

      instrumentation.registerNavigationContainer({
        current: mockNavigationContainer,
      });

      expect(RN_GLOBAL_OBJ.__sentry_rn_v5_registered).toBe(true);

      expect(mockNavigationContainer.addListener).not.toHaveBeenCalled();
    });

    test('does register navigation container if received a new reference', () => {
      const instrumentation = reactNavigationIntegration();
      const refHolder: { current: MockNavigationContainer | undefined } = { current: undefined };
      const firstContainer = new MockNavigationContainer();
      const secondContainer = new MockNavigationContainer();

      refHolder.current = firstContainer;
      instrumentation.registerNavigationContainer(refHolder);

      refHolder.current = secondContainer;
      instrumentation.registerNavigationContainer(refHolder);

      expect(RN_GLOBAL_OBJ.__sentry_rn_v5_registered).toBe(true);

      expect(firstContainer.addListener).toHaveBeenCalledTimes(2);
      expect(firstContainer.addListener).toHaveBeenNthCalledWith(1, '__unsafe_action__', expect.any(Function));
      expect(firstContainer.addListener).toHaveBeenNthCalledWith(2, 'state', expect.any(Function));

      expect(secondContainer.addListener).toHaveBeenCalledTimes(2);
      expect(secondContainer.addListener).toHaveBeenNthCalledWith(1, '__unsafe_action__', expect.any(Function));
      expect(secondContainer.addListener).toHaveBeenNthCalledWith(2, 'state', expect.any(Function));
    });

    test('does not register navigation container if received a new holder with the same reference', () => {
      const instrumentation = reactNavigationIntegration();
      const container = new MockNavigationContainer();

      instrumentation.registerNavigationContainer({
        current: container,
      });

      instrumentation.registerNavigationContainer({
        current: container,
      });

      expect(RN_GLOBAL_OBJ.__sentry_rn_v5_registered).toBe(true);

      expect(container.addListener).toHaveBeenCalledTimes(2);
      expect(container.addListener).toHaveBeenNthCalledWith(1, '__unsafe_action__', expect.any(Function));
      expect(container.addListener).toHaveBeenNthCalledWith(2, 'state', expect.any(Function));
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

    test('after all setup registers for runApplication calls', async () => {
      const { mockedGetAppRegistryIntegration, mockedOnRunApplication } = mockAppRegistryIntegration();

      const instrumentation = reactNavigationIntegration();

      const mockNavigationContainer = new MockNavigationContainer();
      instrumentation.registerNavigationContainer(mockNavigationContainer);

      instrumentation.afterAllSetup(client);
      await jest.runOnlyPendingTimersAsync();

      expect(getActiveSpan()).toBeUndefined();
      expect(mockedGetAppRegistryIntegration).toHaveBeenCalledOnce();
      expect(mockedOnRunApplication).toHaveBeenCalledOnce();

      const runApplicationCallback = mockedOnRunApplication.mock.calls[0][0];
      runApplicationCallback();

      const span = getActiveSpan();
      expect(span).toBeDefined();
      expect(spanToJSON(span)).toEqual(
        expect.objectContaining({
          description: DEFAULT_NAVIGATION_SPAN_NAME,
          op: 'navigation',
        }),
      );
    });

    test('runApplication calls are ignored when the initial state is not handled', async () => {
      // This avoid starting a new navigation span when the application run was called before
      // before the first navigation container is registered.

      const { mockedGetAppRegistryIntegration, mockedOnRunApplication } = mockAppRegistryIntegration();

      reactNavigationIntegration().afterAllSetup(client);
      await jest.runOnlyPendingTimersAsync(); // Flushes the initial navigation span

      expect(getActiveSpan()).toBeUndefined();
      expect(mockedGetAppRegistryIntegration).toHaveBeenCalledOnce();
      expect(mockedOnRunApplication).toHaveBeenCalledOnce();

      const runApplicationCallback = mockedOnRunApplication.mock.calls[0][0];
      runApplicationCallback();

      const span = getActiveSpan();
      expect(span).toBeUndefined();
    });

    test('handles graceful missing app registry integration', async () => {
      // This avoid starting a new navigation span when the application run was called before
      // before the first navigation container is registered.

      const { mockedGetAppRegistryIntegration, mockedOnRunApplication } = mockAppRegistryIntegration();
      mockedOnRunApplication.mockReturnValue(undefined);

      reactNavigationIntegration().afterAllSetup(client);

      expect(mockedGetAppRegistryIntegration).toHaveBeenCalledOnce();
    });
  });

  describe('deferred initial span creation', () => {
    test('initial span is created in registerNavigationContainer when called after afterAllSetup', async () => {
      const instrumentation = reactNavigationIntegration({
        routeChangeTimeoutMs: 200,
      });

      const options = getDefaultTestClientOptions({
        enableNativeFramesTracking: false,
        enableStallTracking: false,
        tracesSampleRate: 1.0,
        integrations: [instrumentation],
        enableAppStartTracking: false,
      });
      client = new TestClient(options);
      setCurrentClient(client);
      client.init();

      // No span created yet — no navigation container registered
      expect(getActiveSpan()).toBeUndefined();

      // Register navigation container after init (production flow)
      const mockNavigationContainer = new MockNavigationContainer();
      instrumentation.registerNavigationContainer({ current: mockNavigationContainer });

      const span = getActiveSpan();
      expect(span).toBeDefined();
      expect(spanToJSON(span!).description).toBe('Route');

      await jest.runOnlyPendingTimersAsync();
      await client.flush();

      expect(client.event).toEqual(
        expect.objectContaining({
          type: 'transaction',
          transaction: 'Route',
        }),
      );
    });

    test('initial span is not discarded by idle timeout when container registers after init', async () => {
      const instrumentation = reactNavigationIntegration({
        routeChangeTimeoutMs: 200,
      });

      const options = getDefaultTestClientOptions({
        enableNativeFramesTracking: false,
        enableStallTracking: false,
        tracesSampleRate: 1.0,
        integrations: [instrumentation],
        enableAppStartTracking: false,
      });
      client = new TestClient(options);
      setCurrentClient(client);
      client.init();

      // Simulate a delay before container registration (e.g. auth gate, slow render)
      jest.advanceTimersByTime(500);
      expect(getActiveSpan()).toBeUndefined();

      // Register after 500ms — should still create the span successfully
      const mockNavigationContainer = new MockNavigationContainer();
      instrumentation.registerNavigationContainer({ current: mockNavigationContainer });

      const span = getActiveSpan();
      expect(span).toBeDefined();

      await jest.runOnlyPendingTimersAsync();
      await client.flush();

      expect(client.event).toEqual(
        expect.objectContaining({
          type: 'transaction',
          transaction: 'Route',
        }),
      );
    });

    test('afterAllSetup does not create span when navigation container is not registered', () => {
      const instrumentation = reactNavigationIntegration();

      const options = getDefaultTestClientOptions({
        enableNativeFramesTracking: false,
        enableStallTracking: false,
        tracesSampleRate: 1.0,
        integrations: [instrumentation],
        enableAppStartTracking: false,
      });
      client = new TestClient(options);
      setCurrentClient(client);
      client.init();

      // No navigation container registered — no span should be created
      expect(getActiveSpan()).toBeUndefined();
    });

    test('subsequent navigations work after deferred initial span', async () => {
      const instrumentation = reactNavigationIntegration({
        routeChangeTimeoutMs: 200,
      });

      const options = getDefaultTestClientOptions({
        enableNativeFramesTracking: false,
        enableStallTracking: false,
        tracesSampleRate: 1.0,
        integrations: [instrumentation],
        enableAppStartTracking: false,
      });
      client = new TestClient(options);
      setCurrentClient(client);
      client.init();

      mockNavigation = createMockNavigationAndAttachTo(instrumentation);

      // Flush the initial span
      jest.runOnlyPendingTimers();
      await client.flush();

      expect(client.event).toEqual(
        expect.objectContaining({
          type: 'transaction',
          transaction: 'Initial Screen',
        }),
      );

      // Navigate to a new screen
      mockNavigation.navigateToNewScreen();
      jest.runOnlyPendingTimers();
      await client.flush();

      expect(client.event).toEqual(
        expect.objectContaining({
          type: 'transaction',
          transaction: 'New Screen',
        }),
      );
    });

    test('runApplication creates span after deferred initial state is handled', async () => {
      const { mockedOnRunApplication } = mockAppRegistryIntegration();

      const instrumentation = reactNavigationIntegration();

      const options = getDefaultTestClientOptions({
        enableNativeFramesTracking: false,
        enableStallTracking: false,
        tracesSampleRate: 1.0,
        integrations: [instrumentation],
        enableAppStartTracking: false,
      });
      client = new TestClient(options);
      setCurrentClient(client);
      client.init();

      // Register container after init
      const mockNavigationContainer = new MockNavigationContainer();
      instrumentation.registerNavigationContainer({ current: mockNavigationContainer });

      // Flush initial span
      await jest.runOnlyPendingTimersAsync();

      // Simulate app restart via runApplication
      const runApplicationCallback = mockedOnRunApplication.mock.calls[0][0];
      runApplicationCallback();

      const span = getActiveSpan();
      expect(span).toBeDefined();
      expect(spanToJSON(span!).op).toBe('navigation');
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

  [true, false].forEach(useDispatchedActionData => {
    describe(`test actions which should not create a navigation span when useDispatchedActionData is ${useDispatchedActionData}`, () => {
      beforeEach(async () => {
        setupTestClient({ useDispatchedActionData });
        await jest.runOnlyPendingTimers(); // Flushes the initial navigation span
        client.event = undefined;
      });

      test(`noop does ${useDispatchedActionData ? 'not' : ''}create a navigation span`, async () => {
        mockNavigation.emitWithStateChange({
          data: {
            action: {
              type: 'UNKNOWN',
            },
            noop: true,
            stack: undefined,
          },
        });
        await jest.runOnlyPendingTimersAsync();
        await client.flush();

        expect(client.event === undefined).toBe(useDispatchedActionData);
      });

      test.each(['PRELOAD', 'SET_PARAMS', 'OPEN_DRAWER', 'CLOSE_DRAWER', 'TOGGLE_DRAWER'])(
        `%s does ${useDispatchedActionData ? 'not' : ''}create a navigation span`,
        async actionType => {
          mockNavigation.emitWithStateChange({
            data: {
              action: {
                type: actionType,
              },
              noop: false,
              stack: undefined,
            },
          });
          await jest.runOnlyPendingTimersAsync();
          await client.flush();

          expect(client.event === undefined).toBe(useDispatchedActionData);
        },
      );
    });
  });

  test('noop does not remove the previous navigation span from scope', async () => {
    setupTestClient({ useDispatchedActionData: true });
    await jest.runOnlyPendingTimers(); // Flushes the initial navigation span

    mockNavigation.emitNavigationWithoutStateChange();
    const activeSpan = getActiveSpan();

    mockNavigation.emitWithoutStateChange({
      data: {
        action: {
          type: 'UNKNOWN',
        },
        noop: true,
        stack: undefined,
      },
    });

    expect(getActiveSpan()).toBe(activeSpan);
  });

  test.each(['PRELOAD', 'SET_PARAMS', 'OPEN_DRAWER', 'CLOSE_DRAWER', 'TOGGLE_DRAWER'])(
    '%s does not remove the previous navigation span from scope',
    async actionType => {
      setupTestClient({ useDispatchedActionData: true });
      await jest.runOnlyPendingTimers(); // Flushes the initial navigation span

      mockNavigation.emitNavigationWithoutStateChange();
      const activeSpan = getActiveSpan();

      mockNavigation.emitWithoutStateChange({
        data: {
          action: {
            type: actionType,
          },
          noop: false,
          stack: undefined,
        },
      });

      expect(getActiveSpan()).toBe(activeSpan);
    },
  );

  describe('setCurrentRoute', () => {
    let mockSetCurrentRoute: jest.Mock;

    beforeEach(() => {
      mockSetCurrentRoute = jest.fn();
      const rnTracingIntegration = reactNativeTracingIntegration();
      rnTracingIntegration.setCurrentRoute = mockSetCurrentRoute;

      const rNavigation = reactNavigationIntegration({
        routeChangeTimeoutMs: 200,
      });
      mockNavigation = createMockNavigationAndAttachTo(rNavigation);

      const options = getDefaultTestClientOptions({
        enableNativeFramesTracking: false,
        enableStallTracking: false,
        tracesSampleRate: 1.0,
        integrations: [rNavigation, rnTracingIntegration],
        enableAppStartTracking: false,
      });

      client = new TestClient(options);
      setCurrentClient(client);
      client.init();

      jest.runOnlyPendingTimers();
    });

    test('setCurrentRoute is called with route name after navigation', async () => {
      expect(mockSetCurrentRoute).toHaveBeenCalledWith('Initial Screen');

      mockSetCurrentRoute.mockClear();
      mockNavigation.navigateToNewScreen();
      jest.runOnlyPendingTimers();

      expect(mockSetCurrentRoute).toHaveBeenCalledWith('New Screen');

      mockSetCurrentRoute.mockClear();
      mockNavigation.navigateToSecondScreen();
      jest.runOnlyPendingTimers();

      expect(mockSetCurrentRoute).toHaveBeenCalledWith('Second Screen');

      mockSetCurrentRoute.mockClear();
      mockNavigation.navigateToInitialScreen();
      jest.runOnlyPendingTimers();

      expect(mockSetCurrentRoute).toHaveBeenCalledWith('Initial Screen');
    });

    test('setCurrentRoute is not called when navigation is cancelled', async () => {
      mockSetCurrentRoute.mockClear();
      mockNavigation.emitCancelledNavigation();
      jest.runOnlyPendingTimers();

      expect(mockSetCurrentRoute).not.toHaveBeenCalled();
    });

    test('setCurrentRoute is not called when navigation finishes', async () => {
      mockSetCurrentRoute.mockClear();
      mockNavigation.finishAppStartNavigation();
      jest.runOnlyPendingTimers();

      expect(mockSetCurrentRoute).not.toHaveBeenCalled();
    });
  });

  describe('useFullPathsForNavigationRoutes option', () => {
    test('transaction uses full path when useFullPathsForNavigationRoutes is true', async () => {
      const rNavigation = reactNavigationIntegration({
        routeChangeTimeoutMs: 200,
        useFullPathsForNavigationRoutes: true,
      });

      const mockNavigationWithNestedState = createMockNavigationWithNestedState(rNavigation);

      const options = getDefaultTestClientOptions({
        enableNativeFramesTracking: false,
        enableStallTracking: false,
        tracesSampleRate: 1.0,
        integrations: [rNavigation, reactNativeTracingIntegration()],
        enableAppStartTracking: false,
      });

      client = new TestClient(options);
      setCurrentClient(client);
      client.init();

      jest.runOnlyPendingTimers(); // Flush the init transaction

      // Navigate to a nested screen: Home -> Settings -> Profile
      mockNavigationWithNestedState.navigateToNestedScreen();
      jest.runOnlyPendingTimers();

      await client.flush();

      const actualEvent = client.event;
      expect(actualEvent).toEqual(
        expect.objectContaining({
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              data: expect.objectContaining({
                [SEMANTIC_ATTRIBUTE_ROUTE_NAME]: 'Home/Settings/Profile',
                [SEMANTIC_ATTRIBUTE_ROUTE_KEY]: 'profile_screen',
              }),
            }),
          }),
        }),
      );
    });

    test('transaction uses only route name when useFullPathsForNavigationRoutes is false', async () => {
      const rNavigation = reactNavigationIntegration({
        routeChangeTimeoutMs: 200,
        useFullPathsForNavigationRoutes: false,
      });

      const mockNavigationWithNestedState = createMockNavigationWithNestedState(rNavigation);

      const options = getDefaultTestClientOptions({
        enableNativeFramesTracking: false,
        enableStallTracking: false,
        tracesSampleRate: 1.0,
        integrations: [rNavigation, reactNativeTracingIntegration()],
        enableAppStartTracking: false,
      });

      client = new TestClient(options);
      setCurrentClient(client);
      client.init();

      jest.runOnlyPendingTimers();

      mockNavigationWithNestedState.navigateToNestedScreen();
      jest.runOnlyPendingTimers();

      await client.flush();

      const actualEvent = client.event;
      expect(actualEvent).toEqual(
        expect.objectContaining({
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              data: expect.objectContaining({
                [SEMANTIC_ATTRIBUTE_ROUTE_NAME]: 'Profile',
                [SEMANTIC_ATTRIBUTE_ROUTE_KEY]: 'profile_screen',
              }),
            }),
          }),
        }),
      );
    });

    test('transaction uses two-level path with nested tab navigator', async () => {
      const rNavigation = reactNavigationIntegration({
        routeChangeTimeoutMs: 200,
        useFullPathsForNavigationRoutes: true,
      });

      const mockNavigationWithNestedState = createMockNavigationWithNestedState(rNavigation);

      const options = getDefaultTestClientOptions({
        enableNativeFramesTracking: false,
        enableStallTracking: false,
        tracesSampleRate: 1.0,
        integrations: [rNavigation, reactNativeTracingIntegration()],
        enableAppStartTracking: false,
      });

      client = new TestClient(options);
      setCurrentClient(client);
      client.init();

      jest.runOnlyPendingTimers();

      mockNavigationWithNestedState.navigateToTwoLevelNested();
      jest.runOnlyPendingTimers();

      await client.flush();

      const actualEvent = client.event;
      expect(actualEvent).toEqual(
        expect.objectContaining({
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              data: expect.objectContaining({
                [SEMANTIC_ATTRIBUTE_ROUTE_NAME]: 'Tabs/Settings',
                [SEMANTIC_ATTRIBUTE_ROUTE_KEY]: 'settings_screen',
              }),
            }),
          }),
        }),
      );
    });

    test('setCurrentRoute receives full path when useFullPathsForNavigationRoutes is true', async () => {
      const mockSetCurrentRoute = jest.fn();
      const rnTracingIntegration = reactNativeTracingIntegration();
      rnTracingIntegration.setCurrentRoute = mockSetCurrentRoute;

      const rNavigation = reactNavigationIntegration({
        routeChangeTimeoutMs: 200,
        useFullPathsForNavigationRoutes: true,
      });

      const mockNavigationWithNestedState = createMockNavigationWithNestedState(rNavigation);

      const options = getDefaultTestClientOptions({
        enableNativeFramesTracking: false,
        enableStallTracking: false,
        tracesSampleRate: 1.0,
        integrations: [rNavigation, rnTracingIntegration],
        enableAppStartTracking: false,
      });

      client = new TestClient(options);
      setCurrentClient(client);
      client.init();

      jest.runOnlyPendingTimers();

      mockSetCurrentRoute.mockClear();
      mockNavigationWithNestedState.navigateToNestedScreen();
      jest.runOnlyPendingTimers();

      expect(mockSetCurrentRoute).toHaveBeenCalledWith('Home/Settings/Profile');
    });

    test('previous route uses full path when useFullPathsForNavigationRoutes is true', async () => {
      const rNavigation = reactNavigationIntegration({
        routeChangeTimeoutMs: 200,
        useFullPathsForNavigationRoutes: true,
      });

      const mockNavigationWithNestedState = createMockNavigationWithNestedState(rNavigation);

      const options = getDefaultTestClientOptions({
        enableNativeFramesTracking: false,
        enableStallTracking: false,
        tracesSampleRate: 1.0,
        integrations: [rNavigation, reactNativeTracingIntegration()],
        enableAppStartTracking: false,
      });

      client = new TestClient(options);
      setCurrentClient(client);
      client.init();

      jest.runOnlyPendingTimers(); // Flush the init transaction

      // First navigation
      mockNavigationWithNestedState.navigateToNestedScreen();
      jest.runOnlyPendingTimers();

      await client.flush();

      // Second navigation
      mockNavigationWithNestedState.navigateToTwoLevelNested();
      jest.runOnlyPendingTimers();

      await client.flush();

      const actualEvent = client.event;
      expect(actualEvent).toEqual(
        expect.objectContaining({
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              data: expect.objectContaining({
                [SEMANTIC_ATTRIBUTE_ROUTE_NAME]: 'Tabs/Settings',
                [SEMANTIC_ATTRIBUTE_PREVIOUS_ROUTE_NAME]: 'Home/Settings/Profile', // Full path in previous route
                [SEMANTIC_ATTRIBUTE_PREVIOUS_ROUTE_KEY]: 'profile_screen',
              }),
            }),
          }),
        }),
      );
    });
  });

  describe('dynamic route params', () => {
    it('includes dynamic route params from [id] route when sendDefaultPii is true', async () => {
      setupTestClient({ sendDefaultPii: true });
      jest.runOnlyPendingTimers(); // Flush the init transaction

      // Navigate to a static screen first so previous_route.name is set to a known value
      mockNavigation.navigateToNewScreen();
      jest.runOnlyPendingTimers(); // Flush the navigation transaction

      mockNavigation.navigateToDynamicRoute();
      jest.runOnlyPendingTimers();

      await client.flush();

      const actualEvent = client.event;
      expect(actualEvent).toEqual(
        expect.objectContaining({
          type: 'transaction',
          transaction: 'profile/[id]',
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              data: expect.objectContaining({
                [SEMANTIC_ATTRIBUTE_ROUTE_NAME]: 'profile/[id]',
                'route.params.id': '123',
                [SEMANTIC_ATTRIBUTE_PREVIOUS_ROUTE_NAME]: 'New Screen',
              }),
            }),
          }),
        }),
      );
    });

    it('includes dynamic route params from [...slug] catch-all route joined with / when sendDefaultPii is true', async () => {
      setupTestClient({ sendDefaultPii: true });
      jest.runOnlyPendingTimers(); // Flush the init transaction

      mockNavigation.navigateToCatchAllRoute();
      jest.runOnlyPendingTimers();

      await client.flush();

      const actualEvent = client.event;
      expect(actualEvent).toEqual(
        expect.objectContaining({
          type: 'transaction',
          transaction: 'posts/[...slug]',
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              data: expect.objectContaining({
                [SEMANTIC_ATTRIBUTE_ROUTE_NAME]: 'posts/[...slug]',
                'route.params.slug': 'tech/react-native',
              }),
            }),
          }),
        }),
      );
    });

    it('does not include dynamic route params when sendDefaultPii is false', async () => {
      setupTestClient({ sendDefaultPii: false });
      jest.runOnlyPendingTimers(); // Flush the init transaction

      mockNavigation.navigateToDynamicRoute();
      jest.runOnlyPendingTimers();

      await client.flush();

      const traceData = client.event?.contexts?.trace?.data as Record<string, unknown>;
      expect(traceData[SEMANTIC_ATTRIBUTE_ROUTE_NAME]).toBe('profile/[id]');
      expect(traceData['route.params.id']).toBeUndefined();
    });

    it('does not include non-dynamic params from static routes', async () => {
      setupTestClient({ sendDefaultPii: true });
      jest.runOnlyPendingTimers(); // Flush the init transaction

      mockNavigation.navigateToStaticRouteWithParams();
      jest.runOnlyPendingTimers();

      await client.flush();

      const traceData = client.event?.contexts?.trace?.data as Record<string, unknown>;
      expect(traceData[SEMANTIC_ATTRIBUTE_ROUTE_NAME]).toBe('StaticScreen');
      expect(traceData['route.params.utm_source']).toBeUndefined();
    });
  });

  function setupTestClient(
    setupOptions: {
      beforeSpanStart?: (options: StartSpanOptions) => StartSpanOptions;
      useDispatchedActionData?: boolean;
      sendDefaultPii?: boolean;
    } = {},
  ) {
    const rNavigation = reactNavigationIntegration({
      routeChangeTimeoutMs: 200,
      useDispatchedActionData: setupOptions.useDispatchedActionData,
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
      sendDefaultPii: setupOptions.sendDefaultPii,
    });
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();
  }
});
