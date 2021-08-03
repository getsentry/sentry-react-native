import { BrowserClient } from "@sentry/browser";
import { addGlobalEventProcessor, Hub } from "@sentry/hub";
import { IdleTransaction, Transaction } from "@sentry/tracing";

import { NativeAppStartResponse } from "../../src/js/definitions";
import { RoutingInstrumentation } from "../../src/js/tracing/routingInstrumentation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockFunction<T extends (...args: any[]) => any>(
  fn: T
): jest.MockedFunction<T> {
  return fn as jest.MockedFunction<T>;
}

jest.mock("../../src/js/wrapper", () => {
  return {
    NATIVE: {
      fetchNativeAppStart: jest.fn(),
      enableNative: true,
    },
  };
});

jest.mock("../../src/js/tracing/utils", () => {
  const originalUtils = jest.requireActual("../../src/js/tracing/utils");

  return {
    ...originalUtils,
    getTimeOriginMilliseconds: jest.fn(),
  };
});

const getMockHub = () => {
  const mockHub = new Hub(new BrowserClient({ tracesSampleRate: 1 }));
  let scopeTransaction: Transaction | undefined;
  const mockScope = {
    getTransaction: () => scopeTransaction,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setSpan(span: any) {
      scopeTransaction = span;
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockHub.getScope = () => mockScope as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockHub.configureScope = jest.fn((callback) => callback(mockScope as any));

  return mockHub;
};

import { ReactNativeTracing } from "../../src/js/tracing/reactnativetracing";
import { getTimeOriginMilliseconds } from "../../src/js/tracing/utils";
import { NATIVE } from "../../src/js/wrapper";

beforeEach(() => {
  NATIVE.enableNative = true;
  jest.useFakeTimers();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("ReactNativeTracing", () => {
  describe("App Start", () => {
    describe("Without routing instrumentation", () => {
      it("Starts route transaction (cold)", (done) => {
        const integration = new ReactNativeTracing();

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
          const transaction = mockHub.getScope()?.getTransaction();

          expect(transaction).toBeDefined();

          jest.runOnlyPendingTimers();

          if (transaction) {
            expect(transaction.startTimestamp).toBe(
              appStartTimeMilliseconds / 1000
            );
            expect(transaction.op).toBe("ui.load");

            expect(
              // @ts-ignore access private for test
              transaction._measurements?.app_start_cold?.value
            ).toEqual(timeOriginMilliseconds - appStartTimeMilliseconds);

            done();
          }
        });
      });

      it("Starts route transaction (warm)", (done) => {
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

          jest.runOnlyPendingTimers();

          if (transaction) {
            expect(transaction.startTimestamp).toBe(
              appStartTimeMilliseconds / 1000
            );
            expect(transaction.op).toBe("ui.load");

            expect(
              // @ts-ignore access private for test
              transaction._measurements?.app_start_warm?.value
            ).toEqual(timeOriginMilliseconds - appStartTimeMilliseconds);

            done();
          }
        });
      });

      it("Does not create app start transaction if didFetchAppStart == true", (done) => {
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

          jest.runOnlyPendingTimers();

          done();
        });
      });
    });

    describe("With routing instrumentation", () => {
      it("Adds measurements and child span onto existing routing transaction and sets the op (cold)", (done) => {
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

        // use setImmediate as app start is handled inside a promise.
        setImmediate(() => {
          const transaction = mockHub.getScope()?.getTransaction();

          expect(transaction).toBeUndefined();

          const routeTransaction = routingInstrumentation.onRouteWillChange({
            name: "test",
          }) as IdleTransaction;
          routeTransaction.initSpanRecorder(10);

          expect(routeTransaction).toBeDefined();
          expect(routeTransaction).toBe(mockHub.getScope()?.getTransaction());

          if (routeTransaction) {
            jest.runOnlyPendingTimers();

            // @ts-ignore access private for test
            expect(routeTransaction._measurements?.app_start_cold?.value).toBe(
              timeOriginMilliseconds - appStartTimeMilliseconds
            );

            expect(routeTransaction.op).toBe("ui.load");
            expect(routeTransaction.startTimestamp).toBe(
              appStartTimeMilliseconds / 1000
            );

            const spanRecorder = routeTransaction.spanRecorder;
            expect(spanRecorder).toBeDefined();
            if (spanRecorder) {
              expect(spanRecorder.spans.length).toBe(2);

              const span = spanRecorder.spans[1];

              expect(span.op).toBe("app.start.cold");
              expect(span.description).toBe("Cold App Start");
              expect(span.startTimestamp).toBe(appStartTimeMilliseconds / 1000);
              expect(span.endTimestamp).toBe(timeOriginMilliseconds / 1000);
            }

            done();
          }
        });
      });

      it("Adds measurements and child span onto existing routing transaction and sets the op (cold)", (done) => {
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

        // use setImmediate as app start is handled inside a promise.
        setImmediate(() => {
          const transaction = mockHub.getScope()?.getTransaction();

          expect(transaction).toBeUndefined();

          const routeTransaction = routingInstrumentation.onRouteWillChange({
            name: "test",
          }) as IdleTransaction;
          routeTransaction.initSpanRecorder(10);

          expect(routeTransaction).toBeDefined();
          expect(routeTransaction).toBe(mockHub.getScope()?.getTransaction());

          if (routeTransaction) {
            jest.runOnlyPendingTimers();

            // @ts-ignore access private for test
            expect(routeTransaction._measurements?.app_start_warm?.value).toBe(
              timeOriginMilliseconds - appStartTimeMilliseconds
            );

            expect(routeTransaction.op).toBe("ui.load");
            expect(routeTransaction.startTimestamp).toBe(
              appStartTimeMilliseconds / 1000
            );

            const spanRecorder = routeTransaction.spanRecorder;
            expect(spanRecorder).toBeDefined();
            if (spanRecorder) {
              expect(spanRecorder.spans.length).toBe(2);

              const span = spanRecorder.spans[1];

              expect(span.op).toBe("app.start.warm");
              expect(span.description).toBe("Warm App Start");
              expect(span.startTimestamp).toBe(appStartTimeMilliseconds / 1000);
              expect(span.endTimestamp).toBe(timeOriginMilliseconds / 1000);
            }

            done();
          }
        });
      });

      it("Does not update route transaction if didFetchAppStart == true", (done) => {
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

        // use setImmediate as app start is handled inside a promise.
        setImmediate(() => {
          const transaction = mockHub.getScope()?.getTransaction();

          expect(transaction).toBeUndefined();

          const routeTransaction = routingInstrumentation.onRouteWillChange({
            name: "test",
          }) as IdleTransaction;
          routeTransaction.initSpanRecorder(10);

          expect(routeTransaction).toBeDefined();
          expect(routeTransaction).toBe(mockHub.getScope()?.getTransaction());

          if (routeTransaction) {
            jest.runOnlyPendingTimers();

            // @ts-ignore access private for test
            expect(routeTransaction._measurements).toMatchObject({});

            expect(routeTransaction.op).not.toBe("ui.load");
            expect(routeTransaction.startTimestamp).not.toBe(
              appStartTimeMilliseconds / 1000
            );

            const spanRecorder = routeTransaction.spanRecorder;
            expect(spanRecorder).toBeDefined();
            if (spanRecorder) {
              expect(spanRecorder.spans.length).toBe(1);
            }

            done();
          }
        });
      });
    });

    it("Does not instrument app start if app start is disabled", (done) => {
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

    it("Does not instrument app start if native is disabled", (done) => {
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

    it("Does not instrument app start if fetchNativeAppStart returns null", (done) => {
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
});
