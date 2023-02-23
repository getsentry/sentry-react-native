/* eslint-disable @typescript-eslint/no-explicit-any */
import type { User } from '@sentry/browser';
import { BrowserClient } from '@sentry/browser';
import { addGlobalEventProcessor, Hub } from '@sentry/core';
import type { IdleTransaction, Transaction } from '@sentry/tracing';

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

const getMockHub = () => {
  const mockHub = new Hub(new BrowserClient({ tracesSampleRate: 1 } as BrowserClientOptions));
  let scopeTransaction: Transaction | undefined;
  let scopeUser: User | undefined;
  const mockScope = {
    getTransaction: () => scopeTransaction,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setSpan(span: any) {
      scopeTransaction = span;
    },
    setTag(_tag: any) {
      // Placeholder
    },
    addBreadcrumb(_breadcrumb: any) {
      // Placeholder
    },
    getUser: () => scopeUser,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockHub.getScope = () => mockScope as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockHub.configureScope = jest.fn((callback) => callback(mockScope as any));

  return mockHub;
};

import type { BrowserClientOptions } from '@sentry/browser/types/client';

import { ReactNativeTracing } from '../../src/js/tracing/reactnativetracing';
import { getTimeOriginMilliseconds } from '../../src/js/tracing/utils';
import { NATIVE } from '../../src/js/wrapper';
import { mockFunction } from '../testutils';

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
});
