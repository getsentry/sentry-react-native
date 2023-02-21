/* eslint-disable @typescript-eslint/no-explicit-any */
import type { User } from '@sentry/browser';
import { BrowserClient } from '@sentry/browser';
import { addGlobalEventProcessor, Hub } from '@sentry/core';
import type { IdleTransaction, SpanStatusType } from '@sentry/tracing';
import { Transaction } from '@sentry/tracing';

import type { NativeAppStartResponse } from '../../src/js/NativeRNSentry';
import type { OnConfirmRoute, TransactionCreator } from '../../src/js/tracing/routingInstrumentation';
import { RoutingInstrumentation } from '../../src/js/tracing/routingInstrumentation';
import type { BeforeNavigate } from '../../src/js/tracing/types';

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
    addBreadcrumb(_breadcrumb: any) {
      // Placeholder
    },
    getUser: () => scopeUser,
  }
};

const getMockHub = () => {
  const mockHub = new Hub(new BrowserClient({ tracesSampleRate: 1 } as BrowserClientOptions));
  const mockScope = getMockScope();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockHub.getScope = () => mockScope as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockHub.configureScope = jest.fn((callback) => callback(mockScope as any));

  return mockHub;
};

import type { BrowserClientOptions } from '@sentry/browser/types/client';
import type { Scope } from '@sentry/types';

import { ReactNativeTracing } from '../../src/js/tracing/reactnativetracing';
import { getTimeOriginMilliseconds } from '../../src/js/tracing/utils';
import { NATIVE } from '../../src/js/wrapper';
import { firstArg, mockFunction } from '../testutils';

const DEFAULT_IDLE_TIMEOUT = 1000;

beforeEach(() => {
  NATIVE.enableNative = true;
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('ReactNativeTracing', () => {
  describe('App Start', () => {
    describe('Without routing instrumentation', () => {
      it('Starts route transaction (cold)', (done) => {
        const integration = new ReactNativeTracing({
          enableNativeFramesTracking: false,
        });

        const timeOriginMilliseconds = Date.now();
        const appStartTimeMilliseconds = timeOriginMilliseconds - 100;
        const mockAppStartResponse: NativeAppStartResponse = {
          isColdStart: true,
          appStartTime: appStartTimeMilliseconds,
          didFetchAppStart: false,
        };

        mockFunction(getTimeOriginMilliseconds).mockReturnValue(
          timeOriginMilliseconds
        );
        // eslint-disable-next-line @typescript-eslint/unbound-method
        mockFunction(NATIVE.fetchNativeAppStart).mockResolvedValue(
          mockAppStartResponse
        );

        const mockHub = getMockHub();
        integration.setupOnce(addGlobalEventProcessor, () => mockHub);

        // use setImmediate as app start is handled inside a promise.
        setImmediate(() => {
          integration.onAppStartFinish(Date.now() / 1000);
          const transaction = mockHub.getScope()?.getTransaction();

          expect(transaction).toBeDefined();

          if (transaction) {
            expect(transaction.startTimestamp).toBe(
              appStartTimeMilliseconds / 1000
            );
            expect(transaction.op).toBe('ui.load');

            expect(
              // @ts-ignore access private for test
              transaction._measurements['app.start.cold'].value
            ).toEqual(timeOriginMilliseconds - appStartTimeMilliseconds);
            expect(
              // @ts-ignore access private for test
              transaction._measurements['app.start.cold'].unit).toBe('millisecond');

            done();
          }
        });
      });

      it('Starts route transaction (warm)', (done) => {
        const integration = new ReactNativeTracing();

        const timeOriginMilliseconds = Date.now();
        const appStartTimeMilliseconds = timeOriginMilliseconds - 100;
        const mockAppStartResponse: NativeAppStartResponse = {
          isColdStart: false,
          appStartTime: appStartTimeMilliseconds,
          didFetchAppStart: false,
        };

        mockFunction(getTimeOriginMilliseconds).mockReturnValue(
          timeOriginMilliseconds
        );
        // eslint-disable-next-line @typescript-eslint/unbound-method
        mockFunction(NATIVE.fetchNativeAppStart).mockResolvedValue(
          mockAppStartResponse
        );

        const mockHub = getMockHub();
        integration.setupOnce(addGlobalEventProcessor, () => mockHub);

        // use setImmediate as app start is handled inside a promise.
        setImmediate(() => {
          const transaction = mockHub.getScope()?.getTransaction();

          expect(transaction).toBeDefined();

          if (transaction) {
            expect(transaction.startTimestamp).toBe(
              appStartTimeMilliseconds / 1000
            );
            expect(transaction.op).toBe('ui.load');

            expect(
              // @ts-ignore access private for test
              transaction._measurements['app.start.warm'].value
            ).toEqual(timeOriginMilliseconds - appStartTimeMilliseconds);
            expect(
              // @ts-ignore access private for test
              transaction._measurements['app.start.warm'].unit).toBe('millisecond');

            done();
          }
        });
      });

      it('Does not add app start measurement if more than 60s', (done) => {
        const integration = new ReactNativeTracing();

        const timeOriginMilliseconds = Date.now();
        const appStartTimeMilliseconds = timeOriginMilliseconds - 65000;
        const mockAppStartResponse: NativeAppStartResponse = {
          isColdStart: false,
          appStartTime: appStartTimeMilliseconds,
          didFetchAppStart: false,
        };

        mockFunction(getTimeOriginMilliseconds).mockReturnValue(
          timeOriginMilliseconds
        );
        // eslint-disable-next-line @typescript-eslint/unbound-method
        mockFunction(NATIVE.fetchNativeAppStart).mockResolvedValue(
          mockAppStartResponse
        );

        const mockHub = getMockHub();
        integration.setupOnce(addGlobalEventProcessor, () => mockHub);

        // use setImmediate as app start is handled inside a promise.
        setImmediate(() => {
          const transaction = mockHub.getScope()?.getTransaction();

          expect(transaction).toBeDefined();

          if (transaction) {
            expect(
              // @ts-ignore access private for test
              transaction._measurements['app.start.warm']
            ).toBeUndefined();

            expect(
              // @ts-ignore access private for test
              transaction._measurements['app.start.cold']
            ).toBeUndefined();

            done();
          }
        });
      });

      it('Does not create app start transaction if didFetchAppStart == true', (done) => {
        const integration = new ReactNativeTracing();

        const timeOriginMilliseconds = Date.now();
        const appStartTimeMilliseconds = timeOriginMilliseconds - 100;
        const mockAppStartResponse: NativeAppStartResponse = {
          isColdStart: true,
          appStartTime: appStartTimeMilliseconds,
          didFetchAppStart: true,
        };

        mockFunction(getTimeOriginMilliseconds).mockReturnValue(
          timeOriginMilliseconds
        );
        // eslint-disable-next-line @typescript-eslint/unbound-method
        mockFunction(NATIVE.fetchNativeAppStart).mockResolvedValue(
          mockAppStartResponse
        );

        const mockHub = getMockHub();
        integration.setupOnce(addGlobalEventProcessor, () => mockHub);

        // use setImmediate as app start is handled inside a promise.
        setImmediate(() => {
          const transaction = mockHub.getScope()?.getTransaction();

          expect(transaction).toBeUndefined();

          done();
        });
      });
    });

    describe('With routing instrumentation', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
      });

      it('Adds measurements and child span onto existing routing transaction and sets the op (cold)', async () => {
        const routingInstrumentation = new RoutingInstrumentation();
        const integration = new ReactNativeTracing({
          routingInstrumentation,
        });

        const timeOriginMilliseconds = Date.now();
        const appStartTimeMilliseconds = timeOriginMilliseconds - 100;
        const mockAppStartResponse: NativeAppStartResponse = {
          isColdStart: true,
          appStartTime: appStartTimeMilliseconds,
          didFetchAppStart: false,
        };

        mockFunction(getTimeOriginMilliseconds).mockReturnValue(
          timeOriginMilliseconds
        );
        // eslint-disable-next-line @typescript-eslint/unbound-method
        mockFunction(NATIVE.fetchNativeAppStart).mockResolvedValue(
          mockAppStartResponse
        );

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

        // @ts-ignore access private for test
        expect(routeTransaction._measurements['app.start.cold'].value).toBe(
          timeOriginMilliseconds - appStartTimeMilliseconds
        );

        expect(routeTransaction.op).toBe('ui.load');
        expect(routeTransaction.startTimestamp).toBe(
          appStartTimeMilliseconds / 1000
        );

        const spanRecorder = routeTransaction.spanRecorder;
        expect(spanRecorder).toBeDefined();
        expect(spanRecorder?.spans.length).toBeGreaterThan(1);

        const span = spanRecorder?.spans[spanRecorder?.spans.length - 1];

        expect(span?.op).toBe('app.start.cold');
        expect(span?.description).toBe('Cold App Start');
        expect(span?.startTimestamp).toBe(appStartTimeMilliseconds / 1000);
        expect(span?.endTimestamp).toBe(timeOriginMilliseconds / 1000);
      });

      it('Adds measurements and child span onto existing routing transaction and sets the op (warm)', async () => {
        const routingInstrumentation = new RoutingInstrumentation();
        const integration = new ReactNativeTracing({
          routingInstrumentation,
        });

        const timeOriginMilliseconds = Date.now();
        const appStartTimeMilliseconds = timeOriginMilliseconds - 100;
        const mockAppStartResponse: NativeAppStartResponse = {
          isColdStart: false,
          appStartTime: appStartTimeMilliseconds,
          didFetchAppStart: false,
        };

        mockFunction(getTimeOriginMilliseconds).mockReturnValue(
          timeOriginMilliseconds
        );
        // eslint-disable-next-line @typescript-eslint/unbound-method
        mockFunction(NATIVE.fetchNativeAppStart).mockResolvedValue(
          mockAppStartResponse
        );

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

        // @ts-ignore access private for test
        expect(routeTransaction._measurements['app.start.warm'].value).toBe(
          timeOriginMilliseconds - appStartTimeMilliseconds
        );

        expect(routeTransaction.op).toBe('ui.load');
        expect(routeTransaction.startTimestamp).toBe(
          appStartTimeMilliseconds / 1000
        );

        const spanRecorder = routeTransaction.spanRecorder;
        expect(spanRecorder).toBeDefined();
        expect(spanRecorder?.spans.length).toBeGreaterThan(1);

        const span = spanRecorder?.spans[spanRecorder?.spans.length - 1];

        expect(span?.op).toBe('app.start.warm');
        expect(span?.description).toBe('Warm App Start');
        expect(span?.startTimestamp).toBe(appStartTimeMilliseconds / 1000);
        expect(span?.endTimestamp).toBe(timeOriginMilliseconds / 1000);
      });

      it('Does not update route transaction if didFetchAppStart == true', async () => {
        const routingInstrumentation = new RoutingInstrumentation();
        const integration = new ReactNativeTracing({
          routingInstrumentation,
        });

        const timeOriginMilliseconds = Date.now();
        const appStartTimeMilliseconds = timeOriginMilliseconds - 100;
        const mockAppStartResponse: NativeAppStartResponse = {
          isColdStart: false,
          appStartTime: appStartTimeMilliseconds,
          didFetchAppStart: true,
        };

        mockFunction(getTimeOriginMilliseconds).mockReturnValue(
          timeOriginMilliseconds
        );
        // eslint-disable-next-line @typescript-eslint/unbound-method
        mockFunction(NATIVE.fetchNativeAppStart).mockResolvedValue(
          mockAppStartResponse
        );

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

        // @ts-ignore access private for test
        expect(routeTransaction._measurements).toMatchObject({});

        expect(routeTransaction.op).not.toBe('ui.load');
        expect(routeTransaction.startTimestamp).not.toBe(
          appStartTimeMilliseconds / 1000
        );

        const spanRecorder = routeTransaction.spanRecorder;
        expect(spanRecorder).toBeDefined();
        expect(spanRecorder?.spans.length).toBe(2);
      });
    });

    it('Does not instrument app start if app start is disabled', (done) => {
      const integration = new ReactNativeTracing({
        enableAppStartTracking: false,
      });
      const mockHub = getMockHub();
      integration.setupOnce(addGlobalEventProcessor, () => mockHub);

      setImmediate(() => {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(NATIVE.fetchNativeAppStart).not.toBeCalled();

        const transaction = mockHub.getScope()?.getTransaction();

        expect(transaction).toBeUndefined();

        done();
      });
    });

    it('Does not instrument app start if native is disabled', (done) => {
      NATIVE.enableNative = false;

      const integration = new ReactNativeTracing();
      const mockHub = getMockHub();
      integration.setupOnce(addGlobalEventProcessor, () => mockHub);

      setImmediate(() => {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(NATIVE.fetchNativeAppStart).not.toBeCalled();

        const transaction = mockHub.getScope()?.getTransaction();

        expect(transaction).toBeUndefined();

        done();
      });
    });

    it('Does not instrument app start if fetchNativeAppStart returns null', (done) => {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      mockFunction(NATIVE.fetchNativeAppStart).mockResolvedValue(null);

      const integration = new ReactNativeTracing();
      const mockHub = getMockHub();
      integration.setupOnce(addGlobalEventProcessor, () => mockHub);

      setImmediate(() => {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(NATIVE.fetchNativeAppStart).toBeCalledTimes(1);

        const transaction = mockHub.getScope()?.getTransaction();

        expect(transaction).toBeUndefined();

        done();
      });
    });
  });

  describe('Native Frames', () => {
    it('Initialize native frames instrumentation if flag is true', (done) => {
      const integration = new ReactNativeTracing({
        enableNativeFramesTracking: true,
      });
      const mockHub = getMockHub();
      integration.setupOnce(addGlobalEventProcessor, () => mockHub);

      setImmediate(() => {
        expect(integration.nativeFramesInstrumentation).toBeDefined();
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(NATIVE.enableNativeFramesTracking).toBeCalledTimes(1);

        done();
      });
    });
    it('Does not initialize native frames instrumentation if flag is false', (done) => {
      const integration = new ReactNativeTracing({
        enableNativeFramesTracking: false,
      });
      const mockHub = getMockHub();
      integration.setupOnce(addGlobalEventProcessor, () => mockHub);

      setImmediate(() => {
        expect(integration.nativeFramesInstrumentation).toBeUndefined();
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(NATIVE.disableNativeFramesTracking).toBeCalledTimes(1);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(NATIVE.fetchNativeFrames).not.toBeCalled();

        done();
      });
    });
  });

  describe('Routing Instrumentation', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    describe('_onConfirmRoute', () => {
      it('Sets tag and adds breadcrumb', () => {
        const routing = new RoutingInstrumentation();
        const integration = new ReactNativeTracing({
          routingInstrumentation: routing,
        });

        const mockScope = {
          addBreadcrumb: jest.fn(),
          setTag: jest.fn(),

          // Not relevant to test
          setSpan: () => { },
          getTransaction: () => { },
          clearTransaction: () => { },
        };

        const mockHub = {
          configureScope: (callback: (scope: any) => void) => {
            callback(mockScope);
          },

          // Not relevant to test
          getScope: () => mockScope,
          getClient: () => ({
            getOptions: () => ({}),
            recordDroppedEvent: () => { },
          }),
        };
        integration.setupOnce(
          () => { },
          () => mockHub as any
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

        expect(mockScope.setTag).toBeCalledWith(
          'routing.route.name',
          routeContext.name
        );
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
    const mockedConfirmedRouteTransactionContext = {
      name: 'mockedRouteName',
      data: {
        route: {
          name: 'mockedRouteName',
        },
      },
    };
    let mockedScope: Scope;
    let mockedHub: Hub;
    let tracing: ReactNativeTracing;
    let mockedUserInteractionId: { elementId: string | undefined; op: string; };
    let mockedRoutingInstrumentation: RoutingInstrumentation & {
      registeredListener?: TransactionCreator,
      registeredBeforeNavigate?: BeforeNavigate,
      registeredOnConfirmRoute?: OnConfirmRoute,
    };

    beforeEach(() => {
      mockedUserInteractionId = { elementId: 'mockedElementId', op: 'mocked.op' };
      mockedHub = getMockHub();
      mockedScope = mockedHub.getScope()!;
      mockedRoutingInstrumentation = {
        name: 'TestRoutingInstrumentationInstance',
        onRouteWillChange: jest.fn(),
        registerRoutingInstrumentation: jest.fn((
          listener: TransactionCreator,
          beforeNavigate: BeforeNavigate,
          onConfirmRoute: OnConfirmRoute,
        ) => {
          mockedRoutingInstrumentation.registeredListener = listener;
          mockedRoutingInstrumentation.registeredBeforeNavigate = beforeNavigate;
          mockedRoutingInstrumentation.registeredOnConfirmRoute = onConfirmRoute;
        }),
      };
    });

    describe('disabled user interaction', () => {
      test('User interaction tracing is disabled by default', () => {
        tracing = new ReactNativeTracing();
        tracing.setupOnce(jest.fn(), () => mockedHub);
        tracing.startUserInteractionTransaction(mockedUserInteractionId);

        expect(tracing.options.enableUserInteractionTracing).toBeFalsy();
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockedScope.setSpan).not.toBeCalled();
      });
    });

    describe('enabled user interaction', () => {
      beforeEach(() => {
        jest.useFakeTimers();
        tracing = new ReactNativeTracing({
          routingInstrumentation: mockedRoutingInstrumentation,
          enableUserInteractionTracing: true,
        });
        tracing.setupOnce(jest.fn(), () => mockedHub);
        mockedRoutingInstrumentation.registeredOnConfirmRoute!(mockedConfirmedRouteTransactionContext);
      });

      afterEach(() => {
        jest.runAllTimers();
        jest.useRealTimers();
      });

      test('user interaction tracing is enabled and transaction is bound to scope', () => {
        tracing.startUserInteractionTransaction(mockedUserInteractionId);

        // eslint-disable-next-line @typescript-eslint/unbound-method
        const actualTransaction = mockFunction(mockedScope.setSpan).mock.calls[0][firstArg];
        const actualTransactionContext = actualTransaction?.toContext();
        expect(tracing.options.enableUserInteractionTracing).toBeTruthy();
        expect(actualTransactionContext).toEqual(expect.objectContaining({
          name: 'mockedRouteName.mockedElementId',
          op: 'mocked.op',
        }));
      });

      test('UI event transaction not sampled if no child spans', () => {
        tracing.startUserInteractionTransaction(mockedUserInteractionId);

        jest.runAllTimers();

        // eslint-disable-next-line @typescript-eslint/unbound-method
        const actualTransaction = mockFunction(mockedScope.setSpan).mock.calls[0][firstArg];
        const actualTransactionContext = actualTransaction?.toContext();
        expect(actualTransactionContext?.sampled).toEqual(false);
      });

      test('do not overwrite existing status of UI event transactions', () => {
        tracing.startUserInteractionTransaction(mockedUserInteractionId);

        const actualTransaction = mockedScope.getTransaction() as Transaction | undefined;
        actualTransaction?.setStatus('mocked_status' as SpanStatusType);

        jest.runAllTimers();

        const actualTransactionContext = actualTransaction?.toContext();
        expect(actualTransactionContext).toEqual(expect.objectContaining({
          endTimestamp: expect.any(Number),
          status: 'mocked_status',
        }));
      });

      test('same UI event and same element reschedule idle timeout', () => {
        const timeoutCloseToActualIdleTimeoutMs = 800;
        tracing.startUserInteractionTransaction(mockedUserInteractionId);
        const actualTransaction = mockedScope.getTransaction() as Transaction | undefined;
        jest.advanceTimersByTime(timeoutCloseToActualIdleTimeoutMs);

        tracing.startUserInteractionTransaction(mockedUserInteractionId);
        jest.advanceTimersByTime(timeoutCloseToActualIdleTimeoutMs);

        expect(actualTransaction?.toContext().endTimestamp).toBeUndefined();
        jest.runAllTimers();

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
        expect(firstTransactionContext).toEqual(expect.objectContaining({
          endTimestamp: expect.any(Number),
          op: 'mocked.op',
          sampled: true,
        }));
        expect(secondTransactionContext).toEqual(expect.objectContaining({
          endTimestamp: expect.any(Number),
          op: 'different.op',
        }));
        expect(firstTransactionContext!.endTimestamp)
          .toBeGreaterThanOrEqual(secondTransactionContext!.startTimestamp!);
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

        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockedScope.setSpan).toBeCalledTimes(1);
        // eslint-disable-next-line @typescript-eslint/unbound-method
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
        expect(interactionTransactionContext).toEqual(expect.objectContaining({
          endTimestamp: expect.any(Number),
          status: 'cancelled',
        }));
        expect(routingTransactionContext).toEqual(expect.objectContaining({
          endTimestamp: expect.any(Number),
        }));
        expect(interactionTransactionContext!.endTimestamp)
          .toBeLessThanOrEqual(routingTransactionContext!.startTimestamp!);
      });
    });
  })
});
