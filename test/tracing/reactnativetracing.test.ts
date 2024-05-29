/* eslint-disable @typescript-eslint/no-explicit-any */
import * as SentryBrowser from '@sentry/browser';
import type { Event, Span } from '@sentry/types';

import type { NativeAppStartResponse } from '../../src/js/NativeRNSentry';
import { RoutingInstrumentation } from '../../src/js/tracing/routingInstrumentation';

jest.mock('../../src/js/wrapper', () => {
  return {
    NATIVE: {
      fetchNativeAppStart: jest.fn(),
      fetchNativeFrames: jest.fn(() => Promise.resolve()),
      disableNativeFramesTracking: jest.fn(() => Promise.resolve()),
      enableNativeFramesTracking: jest.fn(() => Promise.resolve()),
      enableNative: true,
    },
  };
});

jest.mock('../../src/js/tracing/utils', () => {
  const originalUtils = jest.requireActual('../../src/js/tracing/utils');

  return {
    ...originalUtils,
    getTimeOriginMilliseconds: jest.fn(),
  };
});

type MockAppState = {
  setState: (state: AppStateStatus) => void;
  listener: (newState: AppStateStatus) => void;
  removeSubscription: jest.Func;
};
const mockedAppState: AppState & MockAppState = {
  removeSubscription: jest.fn(),
  listener: jest.fn(),
  isAvailable: true,
  currentState: 'active',
  addEventListener: (_, listener) => {
    mockedAppState.listener = listener;
    return {
      remove: mockedAppState.removeSubscription,
    };
  },
  setState: (state: AppStateStatus) => {
    mockedAppState.currentState = state;
    mockedAppState.listener(state);
  },
};
jest.mock('react-native/Libraries/AppState/AppState', () => mockedAppState);

import { getActiveSpan, spanToJSON, startSpanManual } from '@sentry/browser';
import { getCurrentScope, SPAN_STATUS_ERROR, startInactiveSpan } from '@sentry/core';
import type { AppState, AppStateStatus } from 'react-native';

import { APP_START_COLD, APP_START_WARM } from '../../src/js/measurements';
import {
  APP_START_COLD as APP_START_COLD_OP,
  APP_START_WARM as APP_START_WARM_OP,
  UI_LOAD,
} from '../../src/js/tracing';
import { APP_START_WARM as APP_SPAN_START_WARM } from '../../src/js/tracing/ops';
import { ReactNativeTracing } from '../../src/js/tracing/reactnativetracing';
import { getTimeOriginMilliseconds } from '../../src/js/tracing/utils';
import { NATIVE } from '../../src/js/wrapper';
import type { TestClient } from '../mocks/client';
import { setupTestClient } from '../mocks/client';
import { mockFunction } from '../testutils';
import type { MockedRoutingInstrumentation } from './mockedrountinginstrumention';
import { createMockedRoutingInstrumentation } from './mockedrountinginstrumention';

const DEFAULT_IDLE_TIMEOUT = 1000;

describe('ReactNativeTracing', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    NATIVE.enableNative = true;
    mockedAppState.isAvailable = true;
    mockedAppState.addEventListener = (_, listener) => {
      mockedAppState.listener = listener;
      return {
        remove: mockedAppState.removeSubscription,
      };
    };
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('trace propagation targets', () => {
    it('uses tracePropagationTargets', () => {
      const instrumentOutgoingRequests = jest.spyOn(SentryBrowser, 'instrumentOutgoingRequests');
      setupTestClient({
        integrations: [
          new ReactNativeTracing({
            enableStallTracking: false,
            tracePropagationTargets: ['test1', 'test2'],
          }),
        ],
      });

      expect(instrumentOutgoingRequests).toBeCalledWith(
        expect.objectContaining({
          tracePropagationTargets: ['test1', 'test2'],
        }),
      );
    });

    it('uses tracePropagationTargets from client options', () => {
      const instrumentOutgoingRequests = jest.spyOn(SentryBrowser, 'instrumentOutgoingRequests');
      setupTestClient({
        tracePropagationTargets: ['test1', 'test2'],
        integrations: [new ReactNativeTracing({ enableStallTracking: false })],
      });

      expect(instrumentOutgoingRequests).toBeCalledWith(
        expect.objectContaining({
          tracePropagationTargets: ['test1', 'test2'],
        }),
      );
    });

    it('uses defaults', () => {
      const instrumentOutgoingRequests = jest.spyOn(SentryBrowser, 'instrumentOutgoingRequests');
      setupTestClient({
        integrations: [new ReactNativeTracing({ enableStallTracking: false })],
      });

      expect(instrumentOutgoingRequests).toBeCalledWith(
        expect.objectContaining({
          tracePropagationTargets: ['localhost', /^\/(?!\/)/],
        }),
      );
    });

    it('client tracePropagationTargets takes priority over integration options', () => {
      const instrumentOutgoingRequests = jest.spyOn(SentryBrowser, 'instrumentOutgoingRequests');
      setupTestClient({
        tracePropagationTargets: ['test1', 'test2'],
        integrations: [
          new ReactNativeTracing({
            enableStallTracking: false,
            tracePropagationTargets: ['test3', 'test4'],
          }),
        ],
      });

      expect(instrumentOutgoingRequests).toBeCalledWith(
        expect.objectContaining({
          tracePropagationTargets: ['test1', 'test2'],
        }),
      );
    });
  });

  describe('App Start Tracing Instrumentation', () => {
    let client: TestClient;

    beforeEach(() => {
      client = setupTestClient();
    });

    describe('App Start without routing instrumentation', () => {
      it('Starts route transaction (cold)', async () => {
        const integration = new ReactNativeTracing({
          enableNativeFramesTracking: false,
        });

        const [timeOriginMilliseconds, appStartTimeMilliseconds] = mockAppStartResponse({ cold: true });

        integration.setup(client);
        integration.onAppStartFinish(Date.now() / 1000);

        await jest.advanceTimersByTimeAsync(500);
        await jest.runOnlyPendingTimersAsync();

        const transaction = client.event;

        expect(transaction).toBeDefined();
        expect(transaction?.start_timestamp).toBe(appStartTimeMilliseconds / 1000);
        expect(transaction?.contexts?.trace?.op).toBe(UI_LOAD);

        expect(transaction?.measurements?.[APP_START_COLD].value).toEqual(
          timeOriginMilliseconds - appStartTimeMilliseconds,
        );
        expect(transaction?.measurements?.[APP_START_COLD].unit).toBe('millisecond');
      });

      it('Starts route transaction (warm)', async () => {
        const integration = new ReactNativeTracing();

        const [timeOriginMilliseconds, appStartTimeMilliseconds] = mockAppStartResponse({ cold: false });

        integration.setup(client);

        await jest.advanceTimersByTimeAsync(500);
        await jest.runOnlyPendingTimersAsync();

        const transaction = client.event;

        expect(transaction).toBeDefined();
        expect(transaction?.start_timestamp).toBe(appStartTimeMilliseconds / 1000);
        expect(transaction?.contexts?.trace?.op).toBe(UI_LOAD);

        expect(transaction?.measurements?.[APP_START_WARM].value).toEqual(
          timeOriginMilliseconds - appStartTimeMilliseconds,
        );
        expect(transaction?.measurements?.[APP_START_WARM].unit).toBe('millisecond');
      });

      it('Cancels route transaction when app goes to background', async () => {
        const integration = new ReactNativeTracing();

        mockAppStartResponse({ cold: false });

        integration.setup(client);

        await jest.advanceTimersByTimeAsync(500);

        mockedAppState.setState('background');
        jest.runAllTimers();

        const transaction = client.event;
        expect(transaction?.contexts?.trace?.status).toBe('cancelled');
        expect(mockedAppState.removeSubscription).toBeCalledTimes(1);
      });

      it('Does not crash when AppState is not available', async () => {
        mockedAppState.isAvailable = false;
        mockedAppState.addEventListener = (() => {
          return undefined;
        }) as unknown as (typeof mockedAppState)['addEventListener']; // RN Web can return undefined

        setupTestClient({
          integrations: [new ReactNativeTracing()],
        });

        mockAppStartResponse({ cold: false });

        await jest.advanceTimersByTimeAsync(500);
        const transaction = getActiveSpan();

        jest.runAllTimers();

        expect(spanToJSON(transaction!).timestamp).toBeDefined();
      });

      it('Does not add app start measurement if more than 60s', async () => {
        const integration = new ReactNativeTracing();

        const timeOriginMilliseconds = Date.now();
        const appStartTimeMilliseconds = timeOriginMilliseconds - 65000;
        const mockAppStartResponse: NativeAppStartResponse = {
          isColdStart: false,
          appStartTime: appStartTimeMilliseconds,
          didFetchAppStart: false,
        };

        mockFunction(getTimeOriginMilliseconds).mockReturnValue(timeOriginMilliseconds);
        mockFunction(NATIVE.fetchNativeAppStart).mockResolvedValue(mockAppStartResponse);

        integration.setup(client);

        await jest.advanceTimersByTimeAsync(500);
        await jest.runOnlyPendingTimersAsync();

        const transaction = client.event;

        expect(transaction).toBeDefined();
        expect(transaction?.measurements?.[APP_START_WARM]).toBeUndefined();
        expect(transaction?.measurements?.[APP_START_COLD]).toBeUndefined();
      });

      it('Does not add app start span if more than 60s', async () => {
        const integration = new ReactNativeTracing();

        const timeOriginMilliseconds = Date.now();
        const appStartTimeMilliseconds = timeOriginMilliseconds - 65000;
        const mockAppStartResponse: NativeAppStartResponse = {
          isColdStart: false,
          appStartTime: appStartTimeMilliseconds,
          didFetchAppStart: false,
        };

        mockFunction(getTimeOriginMilliseconds).mockReturnValue(timeOriginMilliseconds);
        mockFunction(NATIVE.fetchNativeAppStart).mockResolvedValue(mockAppStartResponse);

        integration.setup(client);

        await jest.advanceTimersByTimeAsync(500);
        await jest.runOnlyPendingTimersAsync();

        const transaction = client.event;

        expect(transaction).toBeDefined();
        expect(transaction?.spans?.some(span => span.op == APP_SPAN_START_WARM)).toBeFalse();
        expect(transaction?.start_timestamp).toBeGreaterThanOrEqual(timeOriginMilliseconds / 1000);
      });

      it('Does not create app start transaction if didFetchAppStart == true', async () => {
        const integration = new ReactNativeTracing();

        mockAppStartResponse({ cold: false, didFetchAppStart: true });

        integration.setup(client);

        await jest.advanceTimersByTimeAsync(500);
        await jest.runOnlyPendingTimersAsync();

        const transaction = client.event;
        expect(transaction).toBeUndefined();
      });
    });

    describe('With routing instrumentation', () => {
      it('Cancels route transaction when app goes to background', async () => {
        const routingInstrumentation = new RoutingInstrumentation();
        const integration = new ReactNativeTracing({
          routingInstrumentation,
        });

        mockAppStartResponse({ cold: true });

        integration.setup(client);
        // wait for internal promises to resolve, fetch app start data from mocked native
        await Promise.resolve();

        const routeTransaction = routingInstrumentation.onRouteWillChange({
          name: 'test',
        });

        mockedAppState.setState('background');

        jest.runAllTimers();

        expect(routeTransaction).toBeDefined();
        expect(spanToJSON(routeTransaction!).status).toBe('cancelled');
        expect(mockedAppState.removeSubscription).toBeCalledTimes(1);
      });

      it('Adds measurements and child span onto existing routing transaction and sets the op (cold)', async () => {
        const routingInstrumentation = new RoutingInstrumentation();
        const integration = new ReactNativeTracing({
          routingInstrumentation,
        });

        const [timeOriginMilliseconds, appStartTimeMilliseconds] = mockAppStartResponse({ cold: true });

        integration.setup(client);
        // wait for internal promises to resolve, fetch app start data from mocked native
        await Promise.resolve();

        expect(getActiveSpan()).toBeUndefined();

        routingInstrumentation.onRouteWillChange({
          name: 'test',
        });

        expect(getActiveSpan()).toBeDefined();
        expect(spanToJSON(getActiveSpan()!).description).toEqual('Route Change');

        // trigger idle transaction to finish and call before finish callbacks
        jest.advanceTimersByTime(DEFAULT_IDLE_TIMEOUT);
        jest.runOnlyPendingTimers();

        const routeTransactionEvent = client.event;
        expect(routeTransactionEvent!.measurements![APP_START_COLD].value).toBe(
          timeOriginMilliseconds - appStartTimeMilliseconds,
        );

        expect(routeTransactionEvent!.contexts!.trace!.op).toBe(UI_LOAD);
        expect(routeTransactionEvent!.start_timestamp).toBe(appStartTimeMilliseconds / 1000);

        const span = routeTransactionEvent!.spans![routeTransactionEvent!.spans!.length - 1];
        expect(span!.op).toBe(APP_START_COLD_OP);
        expect(span!.description).toBe('Cold App Start');
        expect(span!.start_timestamp).toBe(appStartTimeMilliseconds / 1000);
        expect(span!.timestamp).toBe(timeOriginMilliseconds / 1000);
      });

      it('Adds measurements and child span onto existing routing transaction and sets the op (warm)', async () => {
        const routingInstrumentation = new RoutingInstrumentation();
        const integration = new ReactNativeTracing({
          routingInstrumentation,
        });

        const [timeOriginMilliseconds, appStartTimeMilliseconds] = mockAppStartResponse({ cold: false });

        integration.setup(client);
        // wait for internal promises to resolve, fetch app start data from mocked native
        await Promise.resolve();

        expect(getActiveSpan()).toBeUndefined();

        routingInstrumentation.onRouteWillChange({
          name: 'test',
        });

        expect(getActiveSpan()).toBeDefined();
        expect(spanToJSON(getActiveSpan()!).description).toEqual('Route Change');

        // trigger idle transaction to finish and call before finish callbacks
        jest.advanceTimersByTime(DEFAULT_IDLE_TIMEOUT);
        jest.runOnlyPendingTimers();

        const routeTransaction = client.event;
        expect(routeTransaction!.measurements![APP_START_WARM].value).toBe(
          timeOriginMilliseconds - appStartTimeMilliseconds,
        );

        expect(routeTransaction!.contexts!.trace!.op).toBe(UI_LOAD);
        expect(routeTransaction!.start_timestamp).toBe(appStartTimeMilliseconds / 1000);

        const span = routeTransaction!.spans![routeTransaction!.spans!.length - 1];
        expect(span!.op).toBe(APP_START_WARM_OP);
        expect(span!.description).toBe('Warm App Start');
        expect(span!.start_timestamp).toBe(appStartTimeMilliseconds / 1000);
        expect(span!.timestamp).toBe(timeOriginMilliseconds / 1000);
      });

      it('Does not update route transaction if didFetchAppStart == true', async () => {
        const routingInstrumentation = new RoutingInstrumentation();
        const integration = new ReactNativeTracing({
          enableStallTracking: false,
          routingInstrumentation,
        });

        const [, appStartTimeMilliseconds] = mockAppStartResponse({ cold: false, didFetchAppStart: true });

        integration.setup(client);
        // wait for internal promises to resolve, fetch app start data from mocked native
        await Promise.resolve();

        expect(getActiveSpan()).toBeUndefined();

        routingInstrumentation.onRouteWillChange({
          name: 'test',
        });

        expect(getActiveSpan()).toBeDefined();
        expect(spanToJSON(getActiveSpan()!).description).toEqual('Route Change');

        // trigger idle transaction to finish and call before finish callbacks
        jest.advanceTimersByTime(DEFAULT_IDLE_TIMEOUT);
        jest.runOnlyPendingTimers();

        const routeTransaction = client.event;
        expect(routeTransaction!.measurements).toBeUndefined();
        expect(routeTransaction!.contexts!.trace!.op).not.toBe(UI_LOAD);
        expect(routeTransaction!.start_timestamp).not.toBe(appStartTimeMilliseconds / 1000);
        expect(routeTransaction!.spans!.length).toBe(0);
      });
    });

    it('Does not instrument app start if app start is disabled', async () => {
      const integration = new ReactNativeTracing({
        enableAppStartTracking: false,
      });
      integration.setup(client);

      await jest.advanceTimersByTimeAsync(500);
      await jest.runOnlyPendingTimersAsync();

      const transaction = client.event;
      expect(transaction).toBeUndefined();
      expect(NATIVE.fetchNativeAppStart).not.toBeCalled();
    });

    it('Does not instrument app start if native is disabled', async () => {
      NATIVE.enableNative = false;

      const integration = new ReactNativeTracing();
      integration.setup(client);

      await jest.advanceTimersByTimeAsync(500);
      await jest.runOnlyPendingTimersAsync();

      const transaction = client.event;
      expect(transaction).toBeUndefined();
      expect(NATIVE.fetchNativeAppStart).not.toBeCalled();
    });

    it('Does not instrument app start if fetchNativeAppStart returns null', async () => {
      mockFunction(NATIVE.fetchNativeAppStart).mockResolvedValue(null);

      const integration = new ReactNativeTracing();
      integration.setup(client);

      await jest.advanceTimersByTimeAsync(500);
      await jest.runOnlyPendingTimersAsync();

      const transaction = client.event;
      expect(transaction).toBeUndefined();
      expect(NATIVE.fetchNativeAppStart).toBeCalledTimes(1);
    });
  });

  describe('Native Frames', () => {
    let client: TestClient;

    beforeEach(() => {
      client = setupTestClient();
    });

    it('Initialize native frames instrumentation if flag is true', async () => {
      const integration = new ReactNativeTracing({
        enableNativeFramesTracking: true,
      });
      integration.setup(client);

      await jest.advanceTimersByTimeAsync(500);

      expect(integration.nativeFramesInstrumentation).toBeDefined();
      expect(NATIVE.enableNativeFramesTracking).toBeCalledTimes(1);
    });
    it('Does not initialize native frames instrumentation if flag is false', async () => {
      const integration = new ReactNativeTracing({
        enableNativeFramesTracking: false,
      });

      integration.setup(client);

      await jest.advanceTimersByTimeAsync(500);

      expect(integration.nativeFramesInstrumentation).toBeUndefined();
      expect(NATIVE.disableNativeFramesTracking).toBeCalledTimes(1);
      expect(NATIVE.fetchNativeFrames).not.toBeCalled();
    });
  });

  describe('Routing Instrumentation', () => {
    let client: TestClient;

    beforeEach(() => {
      client = setupTestClient();
    });

    describe('_onConfirmRoute', () => {
      it('Sets app context', async () => {
        const routing = new RoutingInstrumentation();
        const integration = new ReactNativeTracing({
          routingInstrumentation: routing,
        });

        client.addIntegration(integration);

        routing.onRouteWillChange({ name: 'First Route' });
        await jest.advanceTimersByTimeAsync(500);
        await jest.runOnlyPendingTimersAsync();

        routing.onRouteWillChange({ name: 'Second Route' });
        await jest.advanceTimersByTimeAsync(500);
        await jest.runOnlyPendingTimersAsync();

        const transaction = client.event;
        expect(transaction!.contexts!.app).toBeDefined();
        expect(transaction!.contexts!.app!['view_names']).toEqual(['Second Route']);
      });

      describe('View Names event processor', () => {
        it('Do not overwrite event app context', () => {
          const routing = new RoutingInstrumentation();
          const integration = new ReactNativeTracing({
            routingInstrumentation: routing,
          });

          const expectedRouteName = 'Route';
          const event: Event = { contexts: { app: { appKey: 'value' } } };
          const expectedEvent: Event = { contexts: { app: { appKey: 'value', view_names: [expectedRouteName] } } };

          // @ts-expect-error only for testing.
          integration._currentViewName = expectedRouteName;
          const processedEvent = integration['_getCurrentViewEventProcessor'](event);

          expect(processedEvent).toEqual(expectedEvent);
        });

        it('Do not add view_names if context is undefined', () => {
          const routing = new RoutingInstrumentation();
          const integration = new ReactNativeTracing({
            routingInstrumentation: routing,
          });

          const expectedRouteName = 'Route';
          const event: Event = { release: 'value' };
          const expectedEvent: Event = { release: 'value' };

          // @ts-expect-error only for testing.
          integration._currentViewName = expectedRouteName;
          const processedEvent = integration['_getCurrentViewEventProcessor'](event);

          expect(processedEvent).toEqual(expectedEvent);
        });

        it('ignore view_names if undefined', () => {
          const routing = new RoutingInstrumentation();
          const integration = new ReactNativeTracing({
            routingInstrumentation: routing,
          });

          const event: Event = { contexts: { app: { key: 'value ' } } };
          const expectedEvent: Event = { contexts: { app: { key: 'value ' } } };

          const processedEvent = integration['_getCurrentViewEventProcessor'](event);

          expect(processedEvent).toEqual(expectedEvent);
        });
      });
    });
  });
  describe('Handling deprecated options', () => {
    test('finalTimeoutMs overrides maxTransactionDuration', () => {
      const tracing = new ReactNativeTracing({
        finalTimeoutMs: 123000,
        maxTransactionDuration: 456,
      });
      expect(tracing.options.finalTimeoutMs).toBe(123000);
      // eslint-disable-next-line deprecation/deprecation
      expect(tracing.options.maxTransactionDuration).toBe(456);
    });
    test('maxTransactionDuration translates to finalTimeoutMs', () => {
      const tracing = new ReactNativeTracing({
        maxTransactionDuration: 123,
      });
      expect(tracing.options.finalTimeoutMs).toBe(123000);
      // eslint-disable-next-line deprecation/deprecation
      expect(tracing.options.maxTransactionDuration).toBe(123);
    });
    test('if none maxTransactionDuration and finalTimeoutMs is specified use default', () => {
      const tracing = new ReactNativeTracing({});
      expect(tracing.options.finalTimeoutMs).toBe(600000);
      // eslint-disable-next-line deprecation/deprecation
      expect(tracing.options.maxTransactionDuration).toBe(600);
    });
    test('idleTimeoutMs overrides idleTimeout', () => {
      const tracing = new ReactNativeTracing({
        idleTimeoutMs: 123,
        idleTimeout: 456,
      });
      expect(tracing.options.idleTimeoutMs).toBe(123);
      // eslint-disable-next-line deprecation/deprecation
      expect(tracing.options.idleTimeout).toBe(456);
    });
    test('idleTimeout translates to idleTimeoutMs', () => {
      const tracing = new ReactNativeTracing({
        idleTimeout: 123,
      });
      expect(tracing.options.idleTimeoutMs).toBe(123);
      // eslint-disable-next-line deprecation/deprecation
      expect(tracing.options.idleTimeout).toBe(123);
    });
    test('if none idleTimeout and idleTimeoutMs is specified use default', () => {
      const tracing = new ReactNativeTracing({});
      expect(tracing.options.idleTimeoutMs).toBe(1000);
      // eslint-disable-next-line deprecation/deprecation
      expect(tracing.options.idleTimeout).toBe(1000);
    });
  });

  describe('User Interaction Tracing', () => {
    let client: TestClient;
    let tracing: ReactNativeTracing;
    let mockedUserInteractionId: { elementId: string | undefined; op: string };
    let mockedRoutingInstrumentation: MockedRoutingInstrumentation;

    beforeEach(() => {
      mockedUserInteractionId = { elementId: 'mockedElementId', op: 'mocked.op' };
      client = setupTestClient();
      mockedRoutingInstrumentation = createMockedRoutingInstrumentation();
    });

    describe('disabled user interaction', () => {
      test('User interaction tracing is disabled by default', () => {
        tracing = new ReactNativeTracing();
        tracing.setup(client);
        tracing.startUserInteractionSpan(mockedUserInteractionId);

        expect(tracing.options.enableUserInteractionTracing).toBeFalsy();
        expect(getActiveSpan()).toBeUndefined();
      });
    });

    describe('enabled user interaction', () => {
      beforeEach(() => {
        tracing = new ReactNativeTracing({
          routingInstrumentation: mockedRoutingInstrumentation,
          enableUserInteractionTracing: true,
        });
        tracing.setup(client);
        mockedRoutingInstrumentation.registeredOnConfirmRoute!('mockedRouteName');
      });

      test('user interaction tracing is enabled and transaction is bound to scope', () => {
        tracing.startUserInteractionSpan(mockedUserInteractionId);

        const actualTransaction = getActiveSpan();
        const actualTransactionContext = spanToJSON(actualTransaction!);
        expect(tracing.options.enableUserInteractionTracing).toBeTruthy();
        expect(actualTransactionContext).toEqual(
          expect.objectContaining({
            description: 'mockedRouteName.mockedElementId',
            op: 'mocked.op',
          }),
        );
      });

      test('UI event transaction not sampled if no child spans', () => {
        tracing.startUserInteractionSpan(mockedUserInteractionId);
        const actualTransaction = getActiveSpan();

        jest.runAllTimers();

        expect(actualTransaction).toBeDefined();
        expect(client.event).toBeUndefined();
      });

      test('does cancel UI event transaction when app goes to background', () => {
        tracing.startUserInteractionSpan(mockedUserInteractionId);
        const actualTransaction = getActiveSpan();

        mockedAppState.setState('background');
        jest.runAllTimers();

        const actualTransactionContext = spanToJSON(actualTransaction!);
        expect(actualTransactionContext).toEqual(
          expect.objectContaining({
            timestamp: expect.any(Number),
            status: 'cancelled',
          }),
        );
        expect(mockedAppState.removeSubscription).toBeCalledTimes(1);
      });

      test('do not overwrite existing status of UI event transactions', () => {
        tracing.startUserInteractionSpan(mockedUserInteractionId);
        const actualTransaction = getActiveSpan();

        actualTransaction?.setStatus({ code: SPAN_STATUS_ERROR, message: 'mocked_status' });

        jest.runAllTimers();

        const actualTransactionContext = spanToJSON(actualTransaction!);
        expect(actualTransactionContext).toEqual(
          expect.objectContaining({
            timestamp: expect.any(Number),
            status: 'mocked_status',
          }),
        );
      });

      test('same UI event and same element does not reschedule idle timeout', () => {
        const timeoutCloseToActualIdleTimeoutMs = 800;
        tracing.startUserInteractionSpan(mockedUserInteractionId);
        const actualTransaction = getActiveSpan();
        jest.advanceTimersByTime(timeoutCloseToActualIdleTimeoutMs);

        tracing.startUserInteractionSpan(mockedUserInteractionId);
        jest.advanceTimersByTime(timeoutCloseToActualIdleTimeoutMs);

        expect(spanToJSON(actualTransaction!).timestamp).toEqual(expect.any(Number));
      });

      test('different UI event and same element finish first and start new transaction', () => {
        const timeoutCloseToActualIdleTimeoutMs = 800;
        tracing.startUserInteractionSpan(mockedUserInteractionId);
        const firstTransaction = getActiveSpan();
        jest.advanceTimersByTime(timeoutCloseToActualIdleTimeoutMs);
        const childFirstTransaction = startInactiveSpan({ name: 'Child Span of the first Tx', op: 'child.op' });

        tracing.startUserInteractionSpan({ ...mockedUserInteractionId, op: 'different.op' });
        const secondTransaction = getActiveSpan();
        jest.advanceTimersByTime(timeoutCloseToActualIdleTimeoutMs);
        childFirstTransaction?.end();
        jest.runAllTimers();

        const firstTransactionEvent = client.eventQueue[0];
        expect(firstTransaction).toBeDefined();
        expect(firstTransactionEvent).toEqual(
          expect.objectContaining({
            timestamp: expect.any(Number),
            contexts: expect.objectContaining({
              trace: expect.objectContaining({
                op: 'mocked.op',
              }),
            }),
          }),
        );

        expect(secondTransaction).toBeDefined();
        expect(spanToJSON(secondTransaction!)).toEqual(
          expect.objectContaining({
            timestamp: expect.any(Number),
            op: 'different.op',
          }),
        );
        expect(firstTransactionEvent!.timestamp).toBeGreaterThanOrEqual(
          spanToJSON(secondTransaction!).start_timestamp!,
        );
      });

      test('different UI event and same element finish first transaction with last span', () => {
        const timeoutCloseToActualIdleTimeoutMs = 800;
        tracing.startUserInteractionSpan(mockedUserInteractionId);
        const firstTransaction = getActiveSpan();
        jest.advanceTimersByTime(timeoutCloseToActualIdleTimeoutMs);
        const childFirstTransaction = startInactiveSpan({ name: 'Child Span of the first Tx', op: 'child.op' });

        tracing.startUserInteractionSpan({ ...mockedUserInteractionId, op: 'different.op' });
        jest.advanceTimersByTime(timeoutCloseToActualIdleTimeoutMs);
        childFirstTransaction?.end();
        jest.runAllTimers();

        const firstTransactionEvent = client.eventQueue[0];
        expect(firstTransaction).toBeDefined();
        expect(firstTransactionEvent).toEqual(
          expect.objectContaining({
            timestamp: expect.any(Number),
            contexts: expect.objectContaining({
              trace: expect.objectContaining({
                op: 'mocked.op',
              }),
            }),
          }),
        );
      });

      test('same ui event after UI event transaction finished', () => {
        tracing.startUserInteractionSpan(mockedUserInteractionId);
        const firstTransaction = getActiveSpan();
        jest.runAllTimers();

        tracing.startUserInteractionSpan(mockedUserInteractionId);
        const secondTransaction = getActiveSpan();
        jest.runAllTimers();

        const firstTransactionContext = spanToJSON(firstTransaction!);
        const secondTransactionContext = spanToJSON(secondTransaction!);
        expect(firstTransactionContext!.timestamp).toEqual(expect.any(Number));
        expect(secondTransactionContext!.timestamp).toEqual(expect.any(Number));
        expect(firstTransactionContext!.span_id).not.toEqual(secondTransactionContext!.span_id);
      });

      test('do not start UI event transaction if active transaction on scope', () => {
        const activeTransaction = startSpanManual(
          { name: 'activeTransactionOnScope', scope: getCurrentScope() },
          (span: Span) => span,
        );
        expect(activeTransaction).toBeDefined();
        expect(activeTransaction).toBe(getActiveSpan());

        tracing.startUserInteractionSpan(mockedUserInteractionId);
        expect(activeTransaction).toBe(getActiveSpan());
      });

      test('UI event transaction is canceled when routing transaction starts', () => {
        const timeoutCloseToActualIdleTimeoutMs = 800;
        tracing.startUserInteractionSpan(mockedUserInteractionId);
        const interactionTransaction = getActiveSpan();
        jest.advanceTimersByTime(timeoutCloseToActualIdleTimeoutMs);

        const routingTransaction = mockedRoutingInstrumentation.registeredListener!({
          name: 'newMockedRouteName',
        });
        jest.runAllTimers();

        const interactionTransactionContext = spanToJSON(interactionTransaction!);
        const routingTransactionContext = spanToJSON(routingTransaction!);
        expect(interactionTransactionContext).toEqual(
          expect.objectContaining({
            timestamp: expect.any(Number),
            status: 'cancelled',
          }),
        );
        expect(routingTransactionContext).toEqual(
          expect.objectContaining({
            timestamp: expect.any(Number),
          }),
        );
        expect(interactionTransactionContext!.timestamp).toBeLessThanOrEqual(
          routingTransactionContext!.start_timestamp!,
        );
      });
    });
  });
});

function mockAppStartResponse({ cold, didFetchAppStart }: { cold: boolean; didFetchAppStart?: boolean }) {
  const timeOriginMilliseconds = Date.now();
  const appStartTimeMilliseconds = timeOriginMilliseconds - 100;
  const mockAppStartResponse: NativeAppStartResponse = {
    isColdStart: cold,
    appStartTime: appStartTimeMilliseconds,
    didFetchAppStart: didFetchAppStart ?? false,
  };

  mockFunction(getTimeOriginMilliseconds).mockReturnValue(timeOriginMilliseconds);
  mockFunction(NATIVE.fetchNativeAppStart).mockResolvedValue(mockAppStartResponse);

  return [timeOriginMilliseconds, appStartTimeMilliseconds];
}
