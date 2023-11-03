/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SpanStatusType, User } from '@sentry/browser';
import * as SentryBrowser from '@sentry/browser';
import type { IdleTransaction } from '@sentry/core';
import { addGlobalEventProcessor, Hub, Transaction } from '@sentry/core';

import type { NativeAppStartResponse } from '../../src/js/NativeRNSentry';
import { RoutingInstrumentation } from '../../src/js/tracing/routingInstrumentation';

const BrowserClient = SentryBrowser.BrowserClient;

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

const getMockScope = () => {
  let scopeTransaction: Transaction | undefined;
  let scopeUser: User | undefined;

  return {
    getTransaction: () => scopeTransaction,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setSpan: jest.fn((span: any) => {
      scopeTransaction = span;
    }),
    setTag(_tag: any) {
      // Placeholder
    },
    setContext(_context: any) {
      // Placeholder
    },
    addBreadcrumb(_breadcrumb: any) {
      // Placeholder
    },
    getUser: () => scopeUser,
  };
};

const getMockHub = () => {
  const mockHub = new Hub(
    new BrowserClient({
      tracesSampleRate: 1,
      integrations: [],
      transport: () => ({
        send: jest.fn(),
        flush: jest.fn(),
      }),
      stackParser: () => [],
    }),
  );
  const mockScope = getMockScope();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockHub.getScope = () => mockScope as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockHub.configureScope = jest.fn(callback => callback(mockScope as any));

  return mockHub;
};

import type { Event, Scope } from '@sentry/types';
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
import { firstArg, mockFunction } from '../testutils';
import type { MockedRoutingInstrumentation } from './mockedrountinginstrumention';
import {
  createMockedRoutingInstrumentation,
  mockedConfirmedRouteTransactionContext,
} from './mockedrountinginstrumention';

const DEFAULT_IDLE_TIMEOUT = 1000;

describe('ReactNativeTracing', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    NATIVE.enableNative = true;
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('trace propagation targets', () => {
    it('uses tracingOrigins', () => {
      const instrumentOutgoingRequests = jest.spyOn(SentryBrowser, 'instrumentOutgoingRequests');
      const mockedHub = {
        getClient: () => ({
          getOptions: () => ({}),
        }),
      };

      const integration = new ReactNativeTracing({
        tracingOrigins: ['test1', 'test2'],
      });
      integration.setupOnce(
        () => {},
        () => mockedHub as unknown as Hub,
      );

      expect(instrumentOutgoingRequests).toBeCalledWith(
        expect.objectContaining({
          tracePropagationTargets: ['test1', 'test2'],
        }),
      );
    });

    it('uses tracePropagationTargets', () => {
      const instrumentOutgoingRequests = jest.spyOn(SentryBrowser, 'instrumentOutgoingRequests');
      const mockedHub = {
        getClient: () => ({
          getOptions: () => ({}),
        }),
      };

      const integration = new ReactNativeTracing({
        tracePropagationTargets: ['test1', 'test2'],
      });
      integration.setupOnce(
        () => {},
        () => mockedHub as unknown as Hub,
      );

      expect(instrumentOutgoingRequests).toBeCalledWith(
        expect.objectContaining({
          tracePropagationTargets: ['test1', 'test2'],
        }),
      );
    });

    it('uses tracePropagationTargets from client options', () => {
      const instrumentOutgoingRequests = jest.spyOn(SentryBrowser, 'instrumentOutgoingRequests');
      const mockedHub = {
        getClient: () => ({
          getOptions: () => ({
            tracePropagationTargets: ['test1', 'test2'],
          }),
        }),
      };

      const integration = new ReactNativeTracing({});
      integration.setupOnce(
        () => {},
        () => mockedHub as unknown as Hub,
      );

      expect(instrumentOutgoingRequests).toBeCalledWith(
        expect.objectContaining({
          tracePropagationTargets: ['test1', 'test2'],
        }),
      );
    });

    it('uses defaults', () => {
      const instrumentOutgoingRequests = jest.spyOn(SentryBrowser, 'instrumentOutgoingRequests');
      const mockedHub = {
        getClient: () => ({
          getOptions: () => ({}),
        }),
      };

      const integration = new ReactNativeTracing({});
      integration.setupOnce(
        () => {},
        () => mockedHub as unknown as Hub,
      );

      expect(instrumentOutgoingRequests).toBeCalledWith(
        expect.objectContaining({
          tracePropagationTargets: ['localhost', /^\/(?!\/)/],
        }),
      );
    });

    it('client tracePropagationTargets takes priority over integration options', () => {
      const instrumentOutgoingRequests = jest.spyOn(SentryBrowser, 'instrumentOutgoingRequests');
      const mockedHub = {
        getClient: () => ({
          getOptions: () => ({
            tracePropagationTargets: ['test1', 'test2'],
          }),
        }),
      };

      const integration = new ReactNativeTracing({
        tracePropagationTargets: ['test3', 'test4'],
        tracingOrigins: ['test5', 'test6'],
      });
      integration.setupOnce(
        () => {},
        () => mockedHub as unknown as Hub,
      );

      expect(instrumentOutgoingRequests).toBeCalledWith(
        expect.objectContaining({
          tracePropagationTargets: ['test1', 'test2'],
        }),
      );
    });

    it('integration tracePropagationTargets takes priority over tracingOrigins', () => {
      const instrumentOutgoingRequests = jest.spyOn(SentryBrowser, 'instrumentOutgoingRequests');
      const mockedHub = {
        getClient: () => ({
          getOptions: () => ({}),
        }),
      };

      const integration = new ReactNativeTracing({
        tracePropagationTargets: ['test3', 'test4'],
        tracingOrigins: ['test5', 'test6'],
      });
      integration.setupOnce(
        () => {},
        () => mockedHub as unknown as Hub,
      );

      expect(instrumentOutgoingRequests).toBeCalledWith(
        expect.objectContaining({
          tracePropagationTargets: ['test3', 'test4'],
        }),
      );
    });
  });

  describe('App Start', () => {
    describe('Without routing instrumentation', () => {
      it('Starts route transaction (cold)', async () => {
        const integration = new ReactNativeTracing({
          enableNativeFramesTracking: false,
        });

        const [timeOriginMilliseconds, appStartTimeMilliseconds] = mockAppStartResponse({ cold: true });

        const mockHub = getMockHub();
        integration.setupOnce(addGlobalEventProcessor, () => mockHub);
        integration.onAppStartFinish(Date.now() / 1000);

        await jest.advanceTimersByTimeAsync(500);

        const transaction = mockHub.getScope()?.getTransaction();

        expect(transaction).toBeDefined();

        if (transaction) {
          expect(transaction.startTimestamp).toBe(appStartTimeMilliseconds / 1000);
          expect(transaction.op).toBe(UI_LOAD);

          expect(
            // @ts-expect-error access private for test
            transaction._measurements[APP_START_COLD].value,
          ).toEqual(timeOriginMilliseconds - appStartTimeMilliseconds);
          expect(
            // @ts-expect-error access private for test
            transaction._measurements[APP_START_COLD].unit,
          ).toBe('millisecond');
        }
      });

      it('Starts route transaction (warm)', async () => {
        const integration = new ReactNativeTracing();

        const [timeOriginMilliseconds, appStartTimeMilliseconds] = mockAppStartResponse({ cold: false });

        const mockHub = getMockHub();
        integration.setupOnce(addGlobalEventProcessor, () => mockHub);

        await jest.advanceTimersByTimeAsync(500);
        const transaction = mockHub.getScope()?.getTransaction();

        expect(transaction).toBeDefined();

        if (transaction) {
          expect(transaction.startTimestamp).toBe(appStartTimeMilliseconds / 1000);
          expect(transaction.op).toBe(UI_LOAD);

          expect(
            // @ts-expect-error access private for test
            transaction._measurements[APP_START_WARM].value,
          ).toEqual(timeOriginMilliseconds - appStartTimeMilliseconds);
          expect(
            // @ts-expect-error access private for test
            transaction._measurements[APP_START_WARM].unit,
          ).toBe('millisecond');
        }
      });

      it('Cancels route transaction when app goes to background', async () => {
        const integration = new ReactNativeTracing();

        mockAppStartResponse({ cold: false });

        const mockHub = getMockHub();
        integration.setupOnce(addGlobalEventProcessor, () => mockHub);

        await jest.advanceTimersByTimeAsync(500);
        const transaction = mockHub.getScope()?.getTransaction();

        mockedAppState.setState('background');
        jest.runAllTimers();

        expect(transaction?.status).toBe('cancelled');
        expect(mockedAppState.removeSubscription).toBeCalledTimes(1);
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

        const mockHub = getMockHub();
        integration.setupOnce(addGlobalEventProcessor, () => mockHub);

        await jest.advanceTimersByTimeAsync(500);

        const transaction = mockHub.getScope()?.getTransaction();

        expect(transaction).toBeDefined();

        if (transaction) {
          expect(
            // @ts-expect-error access private for test
            transaction._measurements[APP_START_WARM],
          ).toBeUndefined();

          expect(
            // @ts-expect-error access private for test
            transaction._measurements[APP_START_COLD],
          ).toBeUndefined();
        }
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

        const mockHub = getMockHub();
        integration.setupOnce(addGlobalEventProcessor, () => mockHub);

        await jest.advanceTimersByTimeAsync(500);

        const transaction = mockHub.getScope()?.getTransaction();

        expect(transaction).toBeDefined();

        if (transaction) {
          expect(
            // @ts-expect-error access private for test
            transaction.spanRecorder,
          ).toBeDefined();

          expect(
            // @ts-expect-error access private for test
            transaction.spanRecorder.spans.some(span => span.op == APP_SPAN_START_WARM),
          ).toBe(false);
          expect(transaction.startTimestamp).toBeGreaterThanOrEqual(timeOriginMilliseconds / 1000);
        }
      });

      it('Does not create app start transaction if didFetchAppStart == true', async () => {
        const integration = new ReactNativeTracing();

        mockAppStartResponse({ cold: false, didFetchAppStart: true });

        const mockHub = getMockHub();
        integration.setupOnce(addGlobalEventProcessor, () => mockHub);

        await jest.advanceTimersByTimeAsync(500);

        const transaction = mockHub.getScope()?.getTransaction();

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

        const mockHub = getMockHub();
        integration.setupOnce(addGlobalEventProcessor, () => mockHub);
        // wait for internal promises to resolve, fetch app start data from mocked native
        await Promise.resolve();

        const routeTransaction = routingInstrumentation.onRouteWillChange({
          name: 'test',
        }) as IdleTransaction;

        mockedAppState.setState('background');

        jest.runAllTimers();

        expect(routeTransaction.status).toBe('cancelled');
        expect(mockedAppState.removeSubscription).toBeCalledTimes(1);
      });

      it('Adds measurements and child span onto existing routing transaction and sets the op (cold)', async () => {
        const routingInstrumentation = new RoutingInstrumentation();
        const integration = new ReactNativeTracing({
          routingInstrumentation,
        });

        const [timeOriginMilliseconds, appStartTimeMilliseconds] = mockAppStartResponse({ cold: true });

        const mockHub = getMockHub();
        integration.setupOnce(addGlobalEventProcessor, () => mockHub);
        // wait for internal promises to resolve, fetch app start data from mocked native
        await Promise.resolve();

        const transaction = mockHub.getScope()?.getTransaction();
        expect(transaction).toBeUndefined();

        const routeTransaction = routingInstrumentation.onRouteWillChange({
          name: 'test',
        }) as IdleTransaction;
        routeTransaction.initSpanRecorder(10);

        expect(routeTransaction).toBeDefined();
        expect(routeTransaction.spanId).toEqual(mockHub.getScope()?.getTransaction()?.spanId);

        // trigger idle transaction to finish and call before finish callbacks
        jest.advanceTimersByTime(DEFAULT_IDLE_TIMEOUT);

        // @ts-expect-error access private for test
        expect(routeTransaction._measurements[APP_START_COLD].value).toBe(
          timeOriginMilliseconds - appStartTimeMilliseconds,
        );

        expect(routeTransaction.op).toBe(UI_LOAD);
        expect(routeTransaction.startTimestamp).toBe(appStartTimeMilliseconds / 1000);

        const spanRecorder = routeTransaction.spanRecorder;
        expect(spanRecorder).toBeDefined();
        expect(spanRecorder?.spans.length).toBeGreaterThan(1);

        const span = spanRecorder?.spans[spanRecorder?.spans.length - 1];

        expect(span?.op).toBe(APP_START_COLD_OP);
        expect(span?.description).toBe('Cold App Start');
        expect(span?.startTimestamp).toBe(appStartTimeMilliseconds / 1000);
        expect(span?.endTimestamp).toBe(timeOriginMilliseconds / 1000);
      });

      it('Adds measurements and child span onto existing routing transaction and sets the op (warm)', async () => {
        const routingInstrumentation = new RoutingInstrumentation();
        const integration = new ReactNativeTracing({
          routingInstrumentation,
        });

        const [timeOriginMilliseconds, appStartTimeMilliseconds] = mockAppStartResponse({ cold: false });

        const mockHub = getMockHub();
        integration.setupOnce(addGlobalEventProcessor, () => mockHub);
        // wait for internal promises to resolve, fetch app start data from mocked native
        await Promise.resolve();

        const transaction = mockHub.getScope()?.getTransaction();
        expect(transaction).toBeUndefined();

        const routeTransaction = routingInstrumentation.onRouteWillChange({
          name: 'test',
        }) as IdleTransaction;
        routeTransaction.initSpanRecorder(10);

        expect(routeTransaction).toBeDefined();
        expect(routeTransaction).toBe(mockHub.getScope()?.getTransaction());

        // trigger idle transaction to finish and call before finish callbacks
        jest.advanceTimersByTime(DEFAULT_IDLE_TIMEOUT);

        // @ts-expect-error access private for test
        expect(routeTransaction._measurements[APP_START_WARM].value).toBe(
          timeOriginMilliseconds - appStartTimeMilliseconds,
        );

        expect(routeTransaction.op).toBe(UI_LOAD);
        expect(routeTransaction.startTimestamp).toBe(appStartTimeMilliseconds / 1000);

        const spanRecorder = routeTransaction.spanRecorder;
        expect(spanRecorder).toBeDefined();
        expect(spanRecorder?.spans.length).toBeGreaterThan(1);

        const span = spanRecorder?.spans[spanRecorder?.spans.length - 1];

        expect(span?.op).toBe(APP_START_WARM_OP);
        expect(span?.description).toBe('Warm App Start');
        expect(span?.startTimestamp).toBe(appStartTimeMilliseconds / 1000);
        expect(span?.endTimestamp).toBe(timeOriginMilliseconds / 1000);
      });

      it('Does not update route transaction if didFetchAppStart == true', async () => {
        const routingInstrumentation = new RoutingInstrumentation();
        const integration = new ReactNativeTracing({
          routingInstrumentation,
        });

        const [, appStartTimeMilliseconds] = mockAppStartResponse({ cold: false, didFetchAppStart: true });

        const mockHub = getMockHub();
        integration.setupOnce(addGlobalEventProcessor, () => mockHub);
        // wait for internal promises to resolve, fetch app start data from mocked native
        await Promise.resolve();

        const transaction = mockHub.getScope()?.getTransaction();
        expect(transaction).toBeUndefined();

        const routeTransaction = routingInstrumentation.onRouteWillChange({
          name: 'test',
        }) as IdleTransaction;
        routeTransaction.initSpanRecorder(10);

        expect(routeTransaction).toBeDefined();
        expect(routeTransaction).toBe(mockHub.getScope()?.getTransaction());

        // trigger idle transaction to finish and call before finish callbacks
        jest.advanceTimersByTime(DEFAULT_IDLE_TIMEOUT);

        // @ts-expect-error access private for test
        expect(routeTransaction._measurements).toMatchObject({});

        expect(routeTransaction.op).not.toBe(UI_LOAD);
        expect(routeTransaction.startTimestamp).not.toBe(appStartTimeMilliseconds / 1000);

        const spanRecorder = routeTransaction.spanRecorder;
        expect(spanRecorder).toBeDefined();
        expect(spanRecorder?.spans.length).toBe(2);
      });
    });

    it('Does not instrument app start if app start is disabled', async () => {
      const integration = new ReactNativeTracing({
        enableAppStartTracking: false,
      });
      const mockHub = getMockHub();
      integration.setupOnce(addGlobalEventProcessor, () => mockHub);

      await jest.advanceTimersByTimeAsync(500);

      expect(NATIVE.fetchNativeAppStart).not.toBeCalled();

      const transaction = mockHub.getScope()?.getTransaction();

      expect(transaction).toBeUndefined();
    });

    it('Does not instrument app start if native is disabled', async () => {
      NATIVE.enableNative = false;

      const integration = new ReactNativeTracing();
      const mockHub = getMockHub();
      integration.setupOnce(addGlobalEventProcessor, () => mockHub);

      await jest.advanceTimersByTimeAsync(500);

      expect(NATIVE.fetchNativeAppStart).not.toBeCalled();

      const transaction = mockHub.getScope()?.getTransaction();

      expect(transaction).toBeUndefined();
    });

    it('Does not instrument app start if fetchNativeAppStart returns null', async () => {
      mockFunction(NATIVE.fetchNativeAppStart).mockResolvedValue(null);

      const integration = new ReactNativeTracing();
      const mockHub = getMockHub();
      integration.setupOnce(addGlobalEventProcessor, () => mockHub);

      await jest.advanceTimersByTimeAsync(500);

      expect(NATIVE.fetchNativeAppStart).toBeCalledTimes(1);

      const transaction = mockHub.getScope()?.getTransaction();

      expect(transaction).toBeUndefined();
    });
  });

  describe('Native Frames', () => {
    it('Initialize native frames instrumentation if flag is true', async () => {
      const integration = new ReactNativeTracing({
        enableNativeFramesTracking: true,
      });
      const mockHub = getMockHub();
      integration.setupOnce(addGlobalEventProcessor, () => mockHub);

      await jest.advanceTimersByTimeAsync(500);

      expect(integration.nativeFramesInstrumentation).toBeDefined();
      expect(NATIVE.enableNativeFramesTracking).toBeCalledTimes(1);
    });
    it('Does not initialize native frames instrumentation if flag is false', async () => {
      const integration = new ReactNativeTracing({
        enableNativeFramesTracking: false,
      });
      const mockHub = getMockHub();
      integration.setupOnce(addGlobalEventProcessor, () => mockHub);

      await jest.advanceTimersByTimeAsync(500);

      expect(integration.nativeFramesInstrumentation).toBeUndefined();
      expect(NATIVE.disableNativeFramesTracking).toBeCalledTimes(1);
      expect(NATIVE.fetchNativeFrames).not.toBeCalled();
    });
  });

  describe('Routing Instrumentation', () => {
    describe('_onConfirmRoute', () => {
      it('Sets app context, tag and adds breadcrumb', () => {
        const routing = new RoutingInstrumentation();
        const integration = new ReactNativeTracing({
          routingInstrumentation: routing,
        });
        let mockEvent: Event | null = { contexts: {} };
        const mockScope = {
          addBreadcrumb: jest.fn(),
          setTag: jest.fn(),
          setContext: jest.fn(),

          // Not relevant to test
          setSpan: () => {},
          getTransaction: () => {},
          clearTransaction: () => {},
        };

        const mockHub = {
          configureScope: (callback: (scope: any) => void) => {
            callback(mockScope);
          },

          // Not relevant to test
          getScope: () => mockScope,
          getClient: () => ({
            getOptions: () => ({}),
            recordDroppedEvent: () => {},
          }),
        };
        integration.setupOnce(
          () => {},
          () => mockHub as any,
        );

        const routeContext = {
          name: 'Route',
          data: {
            route: {
              name: 'Route',
            },
            previousRoute: {
              name: 'Previous Route',
            },
          },
        };
        routing.onRouteWillChange(routeContext);

        mockEvent = integration['_getCurrentViewEventProcessor'](mockEvent);

        if (!mockEvent) {
          throw new Error('mockEvent was not defined');
        }
        expect(mockEvent.contexts?.app).toBeDefined();
        // Only required to mark app as defined.
        if (mockEvent.contexts?.app) {
          expect(mockEvent.contexts.app['view_names']).toEqual([routeContext.name]);
        }

        /**
         * @deprecated tag routing.route.name will be removed in the future.
         */
        expect(mockScope.setTag).toBeCalledWith('routing.route.name', routeContext.name);
        expect(mockScope.addBreadcrumb).toBeCalledWith({
          type: 'navigation',
          category: 'navigation',
          message: `Navigation to ${routeContext.name}`,
          data: {
            from: routeContext.data.previousRoute.name,
            to: routeContext.data.route.name,
          },
        });
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
    let mockedScope: Scope;
    let mockedHub: Hub;
    let tracing: ReactNativeTracing;
    let mockedUserInteractionId: { elementId: string | undefined; op: string };
    let mockedRoutingInstrumentation: MockedRoutingInstrumentation;

    beforeEach(() => {
      mockedUserInteractionId = { elementId: 'mockedElementId', op: 'mocked.op' };
      mockedHub = getMockHub();
      mockedScope = mockedHub.getScope()!;
      mockedRoutingInstrumentation = createMockedRoutingInstrumentation();
    });

    describe('disabled user interaction', () => {
      test('User interaction tracing is disabled by default', () => {
        tracing = new ReactNativeTracing();
        tracing.setupOnce(jest.fn(), () => mockedHub);
        tracing.startUserInteractionTransaction(mockedUserInteractionId);

        expect(tracing.options.enableUserInteractionTracing).toBeFalsy();
        expect(mockedScope.setSpan).not.toBeCalled();
      });
    });

    describe('enabled user interaction', () => {
      beforeEach(() => {
        tracing = new ReactNativeTracing({
          routingInstrumentation: mockedRoutingInstrumentation,
          enableUserInteractionTracing: true,
        });
        tracing.setupOnce(jest.fn(), () => mockedHub);
        mockedRoutingInstrumentation.registeredOnConfirmRoute!(mockedConfirmedRouteTransactionContext);
      });

      test('user interaction tracing is enabled and transaction is bound to scope', () => {
        tracing.startUserInteractionTransaction(mockedUserInteractionId);

        const actualTransaction = mockFunction(mockedScope.setSpan).mock.calls[0][firstArg];
        const actualTransactionContext = actualTransaction?.toContext();
        expect(tracing.options.enableUserInteractionTracing).toBeTruthy();
        expect(actualTransactionContext).toEqual(
          expect.objectContaining({
            name: 'mockedRouteName.mockedElementId',
            op: 'mocked.op',
          }),
        );
      });

      test('UI event transaction not sampled if no child spans', () => {
        tracing.startUserInteractionTransaction(mockedUserInteractionId);

        jest.runAllTimers();

        const actualTransaction = mockFunction(mockedScope.setSpan).mock.calls[0][firstArg];
        const actualTransactionContext = actualTransaction?.toContext();
        expect(actualTransactionContext?.sampled).toEqual(false);
      });

      test('does cancel UI event transaction when app goes to background', () => {
        tracing.startUserInteractionTransaction(mockedUserInteractionId);

        const actualTransaction = mockedScope.getTransaction() as Transaction | undefined;

        mockedAppState.setState('background');
        jest.runAllTimers();

        const actualTransactionContext = actualTransaction?.toContext();
        expect(actualTransactionContext).toEqual(
          expect.objectContaining({
            endTimestamp: expect.any(Number),
            status: 'cancelled',
          }),
        );
        expect(mockedAppState.removeSubscription).toBeCalledTimes(1);
      });

      test('do not overwrite existing status of UI event transactions', () => {
        tracing.startUserInteractionTransaction(mockedUserInteractionId);

        const actualTransaction = mockedScope.getTransaction() as Transaction | undefined;
        actualTransaction?.setStatus('mocked_status' as SpanStatusType);

        jest.runAllTimers();

        const actualTransactionContext = actualTransaction?.toContext();
        expect(actualTransactionContext).toEqual(
          expect.objectContaining({
            endTimestamp: expect.any(Number),
            status: 'mocked_status',
          }),
        );
      });

      test('same UI event and same element does not reschedule idle timeout', () => {
        const timeoutCloseToActualIdleTimeoutMs = 800;
        tracing.startUserInteractionTransaction(mockedUserInteractionId);
        const actualTransaction = mockedScope.getTransaction() as Transaction | undefined;
        jest.advanceTimersByTime(timeoutCloseToActualIdleTimeoutMs);

        tracing.startUserInteractionTransaction(mockedUserInteractionId);
        jest.advanceTimersByTime(timeoutCloseToActualIdleTimeoutMs);

        expect(actualTransaction?.toContext().endTimestamp).toEqual(expect.any(Number));
      });

      test('different UI event and same element finish first and start new transaction', () => {
        const timeoutCloseToActualIdleTimeoutMs = 800;
        tracing.startUserInteractionTransaction(mockedUserInteractionId);
        const firstTransaction = mockedScope.getTransaction() as Transaction | undefined;
        jest.advanceTimersByTime(timeoutCloseToActualIdleTimeoutMs);
        const childFirstTransaction = firstTransaction?.startChild({ op: 'child.op' });

        tracing.startUserInteractionTransaction({ ...mockedUserInteractionId, op: 'different.op' });
        const secondTransaction = mockedScope.getTransaction() as Transaction | undefined;
        jest.advanceTimersByTime(timeoutCloseToActualIdleTimeoutMs);
        childFirstTransaction?.finish();
        jest.runAllTimers();

        const firstTransactionContext = firstTransaction?.toContext();
        const secondTransactionContext = secondTransaction?.toContext();
        expect(firstTransactionContext).toEqual(
          expect.objectContaining({
            endTimestamp: expect.any(Number),
            op: 'mocked.op',
            sampled: true,
          }),
        );
        expect(secondTransactionContext).toEqual(
          expect.objectContaining({
            endTimestamp: expect.any(Number),
            op: 'different.op',
          }),
        );
        expect(firstTransactionContext!.endTimestamp).toBeGreaterThanOrEqual(secondTransactionContext!.startTimestamp!);
      });

      test('different UI event and same element finish first transaction with last span', () => {
        const timeoutCloseToActualIdleTimeoutMs = 800;
        tracing.startUserInteractionTransaction(mockedUserInteractionId);
        const firstTransaction = mockedScope.getTransaction() as Transaction | undefined;
        jest.advanceTimersByTime(timeoutCloseToActualIdleTimeoutMs);
        const childFirstTransaction = firstTransaction?.startChild({ op: 'child.op' });

        tracing.startUserInteractionTransaction({ ...mockedUserInteractionId, op: 'different.op' });
        jest.advanceTimersByTime(timeoutCloseToActualIdleTimeoutMs);
        childFirstTransaction?.finish();

        const firstTransactionContext = firstTransaction?.toContext();
        expect(firstTransactionContext).toEqual(
          expect.objectContaining({
            endTimestamp: expect.any(Number),
            op: 'mocked.op',
            sampled: true,
          }),
        );
      });

      test('same ui event after UI event transaction finished', () => {
        tracing.startUserInteractionTransaction(mockedUserInteractionId);
        const firstTransaction = mockedScope.getTransaction() as Transaction | undefined;
        jest.runAllTimers();

        tracing.startUserInteractionTransaction(mockedUserInteractionId);
        const secondTransaction = mockedScope.getTransaction() as Transaction | undefined;
        jest.runAllTimers();

        const firstTransactionContext = firstTransaction?.toContext();
        const secondTransactionContext = secondTransaction?.toContext();
        expect(firstTransactionContext!.endTimestamp).toEqual(expect.any(Number));
        expect(secondTransactionContext!.endTimestamp).toEqual(expect.any(Number));
        expect(firstTransactionContext!.spanId).not.toEqual(secondTransactionContext!.spanId);
      });

      test('do not start UI event transaction if active transaction on scope', () => {
        const activeTransaction = new Transaction({ name: 'activeTransactionOnScope' }, mockedHub);
        mockedScope.setSpan(activeTransaction);

        tracing.startUserInteractionTransaction(mockedUserInteractionId);

        expect(mockedScope.setSpan).toBeCalledTimes(1);
        expect(mockedScope.setSpan).toBeCalledWith(activeTransaction);
      });

      test('UI event transaction is canceled when routing transaction starts', () => {
        const timeoutCloseToActualIdleTimeoutMs = 800;
        tracing.startUserInteractionTransaction(mockedUserInteractionId);
        const interactionTransaction = mockedScope.getTransaction() as Transaction | undefined;
        jest.advanceTimersByTime(timeoutCloseToActualIdleTimeoutMs);

        const routingTransaction = mockedRoutingInstrumentation.registeredListener!({
          name: 'newMockedRouteName',
        });
        jest.runAllTimers();

        const interactionTransactionContext = interactionTransaction?.toContext();
        const routingTransactionContext = routingTransaction?.toContext();
        expect(interactionTransactionContext).toEqual(
          expect.objectContaining({
            endTimestamp: expect.any(Number),
            status: 'cancelled',
          }),
        );
        expect(routingTransactionContext).toEqual(
          expect.objectContaining({
            endTimestamp: expect.any(Number),
          }),
        );
        expect(interactionTransactionContext!.endTimestamp).toBeLessThanOrEqual(
          routingTransactionContext!.startTimestamp!,
        );
      });

      test('UI event transaction calls lifecycle callbacks', () => {
        tracing.onTransactionStart = jest.fn(tracing.onTransactionStart.bind(tracing));
        tracing.onTransactionFinish = jest.fn(tracing.onTransactionFinish.bind(tracing));
        tracing.startUserInteractionTransaction(mockedUserInteractionId);
        const actualTransaction = mockedScope.getTransaction() as Transaction | undefined;
        jest.runAllTimers();

        expect(tracing.onTransactionStart).toBeCalledTimes(1);
        expect(tracing.onTransactionFinish).toBeCalledTimes(1);
        expect(tracing.onTransactionStart).toBeCalledWith(actualTransaction);
        expect(tracing.onTransactionFinish).toBeCalledWith(actualTransaction);
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
