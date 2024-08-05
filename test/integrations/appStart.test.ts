import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import type { ErrorEvent, Event, SpanJSON, TransactionEvent } from '@sentry/types';
import { timestampInSeconds } from '@sentry/utils';

import {
  APP_START_COLD as APP_START_COLD_MEASUREMENT,
  APP_START_WARM as APP_START_WARM_MEASUREMENT,
} from '../../src/js/measurements';
import type { NativeAppStartResponse } from '../../src/js/NativeRNSentry';
import {
  APP_START_COLD as APP_START_COLD_OP,
  APP_START_WARM as APP_START_WARM_OP,
  UI_LOAD,
} from '../../src/js/tracing';
import {
  appStartIntegration,
  setAppStartEndTimestampMs,
  setRootComponentCreationTimestampMs,
} from '../../src/js/tracing/integrations/appStart';
import { getTimeOriginMilliseconds } from '../../src/js/tracing/utils';
import { RN_GLOBAL_OBJ } from '../../src/js/utils/worldwide';
import { NATIVE } from '../../src/js/wrapper';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';
import { mockFunction } from '../testutils';

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

jest.mock('@sentry/utils', () => {
  const originalUtils = jest.requireActual('@sentry/utils');

  return {
    ...originalUtils,
    timestampInSeconds: jest.fn(originalUtils.timestampInSeconds),
  };
});

describe('App Start Integration', () => {
  beforeEach(() => {
    mockReactNativeBundleExecutionStartTimestamp();
  });

  afterEach(() => {
    clearReactNativeBundleExecutionStartTimestamp();
  });

  it('Creates standalone App Start Transaction when no routing instrumentation enabled', () => {});

  describe('App Start Attached to the First Root Span', () => {
    it('Does not add App Start Span to Error Event', async () => {
      const inputEvent: ErrorEvent = {
        type: undefined,
      };

      const actualEvent = await processEvent(inputEvent);
      expect(actualEvent).toEqual({
        type: undefined,
      });
    });

    it('Adds Cold App Start Span to Active Span', async () => {
      const [timeOriginMilliseconds, appStartTimeMilliseconds] = mockAppStart({ cold: true });

      const actualEvent = await processEvent(getMinimalTransactionEvent());
      expect(actualEvent).toEqual(
        expectEventWithColdAppStart(actualEvent, { timeOriginMilliseconds, appStartTimeMilliseconds }),
      );
    });

    it('Adds Warm App Start Span to Active Span', async () => {
      const [timeOriginMilliseconds, appStartTimeMilliseconds] = mockAppStart({ cold: false });

      const actualEvent = await processEvent(getMinimalTransactionEvent());
      expect(actualEvent).toEqual(
        expectEventWithWarmAppStart(actualEvent, { timeOriginMilliseconds, appStartTimeMilliseconds }),
      );
    });

    it('Does not add any spans or measurements when App Start Span is longer than threshold', async () => {
      set__DEV__(false);
      mockTooLongAppStart();

      const actualEvent = await processEvent(getMinimalTransactionEvent());
      expect(actualEvent).toStrictEqual(getMinimalTransactionEvent());
    });

    it('Does add App Start Span spans and measurements longer than threshold in development builds', async () => {
      set__DEV__(true);
      const [timeOriginMilliseconds, appStartTimeMilliseconds] = mockTooLongAppStart();

      const actualEvent = await processEvent(getMinimalTransactionEvent());
      expect(actualEvent).toEqual(
        expectEventWithWarmAppStart(actualEvent, { timeOriginMilliseconds, appStartTimeMilliseconds }),
      );
    });

    it('Does not add App Start Span older than threshold', async () => {
      set__DEV__(false);
      mockTooOldAppStart();

      const actualEvent = await processEvent(getMinimalTransactionEvent());
      expect(actualEvent).toStrictEqual(getMinimalTransactionEvent());
    });

    it('Does add App Start Span older than threshold in development builds', async () => {
      set__DEV__(true);
      const [timeOriginMilliseconds, appStartTimeMilliseconds] = mockTooOldAppStart();

      const actualEvent = await processEvent(
        getMinimalTransactionEvent({ startTimestampSeconds: timeOriginMilliseconds }),
      );
      expect(actualEvent).toEqual(
        expectEventWithWarmAppStart(actualEvent, { timeOriginMilliseconds, appStartTimeMilliseconds }),
      );
    });

    it('Does not create app start transaction if has_fetched == true', async () => {
      mockAppStart({ has_fetched: true });

      const actualEvent = await processEvent(getMinimalTransactionEvent());
      expect(actualEvent).toStrictEqual(getMinimalTransactionEvent());
    });

    it('Does not add bundle execution span when bundle start time is missing', async () => {
      clearReactNativeBundleExecutionStartTimestamp();

      const actualEvent = await processEvent(getMinimalTransactionEvent());
      expect(actualEvent).toStrictEqual(getMinimalTransactionEvent());
    });

    it('Adds bundle execution span', async () => {
      mockReactNativeBundleExecutionStartTimestamp();
      const [timeOriginMilliseconds] = mockAppStart({ cold: true });

      const actualEvent = await processEvent(getMinimalTransactionEvent());

      const appStartRootSpan = actualEvent!.spans!.find(({ description }) => description === 'Cold App Start');
      const bundleStartSpan = actualEvent!.spans!.find(
        ({ description }) => description === 'JS Bundle Execution Start',
      );

      expect(appStartRootSpan).toEqual(
        expect.objectContaining(<SpanJSON>{
          description: 'Cold App Start',
          span_id: expect.any(String),
          op: APP_START_COLD_OP,
        }),
      );
      expect(bundleStartSpan).toEqual(
        expect.objectContaining(<SpanJSON>{
          description: 'JS Bundle Execution Start',
          start_timestamp: expect.closeTo((timeOriginMilliseconds - 50) / 1000),
          timestamp: expect.closeTo((timeOriginMilliseconds - 50) / 1000),
          parent_span_id: appStartRootSpan!.span_id, // parent is the root app start span
          op: appStartRootSpan!.op, // op is the same as the root app start span
        }),
      );
    });

    it('adds bundle execution before react root', async () => {
      mockReactNativeBundleExecutionStartTimestamp();
      const [timeOriginMilliseconds] = mockAppStart({ cold: true });
      setRootComponentCreationTimestampMs(timeOriginMilliseconds - 10);

      const actualEvent = await processEvent(getMinimalTransactionEvent());

      const appStartRootSpan = actualEvent!.spans!.find(({ description }) => description === 'Cold App Start');
      const bundleStartSpan = actualEvent!.spans!.find(
        ({ description }) => description === 'JS Bundle Execution Before React Root',
      );

      expect(appStartRootSpan).toEqual(
        expect.objectContaining(<SpanJSON>{
          description: 'Cold App Start',
          span_id: expect.any(String),
          op: APP_START_COLD_OP,
        }),
      );
      expect(bundleStartSpan).toEqual(
        expect.objectContaining(<SpanJSON>{
          description: 'JS Bundle Execution Before React Root',
          start_timestamp: expect.closeTo((timeOriginMilliseconds - 50) / 1000),
          timestamp: (timeOriginMilliseconds - 10) / 1000,
          parent_span_id: appStartRootSpan!.span_id, // parent is the root app start span
          op: appStartRootSpan!.op, // op is the same as the root app start span
        }),
      );
    });

    it('adds native spans as a child of the main app start span', async () => {});

    it('adds ui kit init full length as a child of the main app start span', async () => {});

    it('adds ui kit init start mark as a child of the main app start span', async () => {});

    it('Does not add app start span twice', async () => {});

    it('Does not add app start span when marked as fetched from the native layer', async () => {});

    it('Does not add app start if native returns null', async () => {});
  });
});

function processEvent(event: Event): PromiseLike<Event | null> | Event | null {
  const integration = appStartIntegration();
  return integration.processEvent(event, {}, new TestClient(getDefaultTestClientOptions()));
}

function getMinimalTransactionEvent({
  startTimestampSeconds = 100,
}: {
  startTimestampSeconds?: number;
} = {}): TransactionEvent {
  return {
    type: 'transaction',
    start_timestamp: startTimestampSeconds,
    contexts: {
      trace: {
        op: 'test',
        span_id: '123',
        trace_id: '456',
      },
    },
    spans: [
      {
        start_timestamp: 100,
        timestamp: 200,
        op: 'test',
        description: 'Test',
        span_id: '123',
        trace_id: '456',
      },
    ],
  };
}

function expectEventWithColdAppStart(
  event: Event,
  {
    timeOriginMilliseconds,
    appStartTimeMilliseconds,
  }: {
    timeOriginMilliseconds: number;
    appStartTimeMilliseconds: number;
  },
) {
  return expect.objectContaining<TransactionEvent>({
    type: 'transaction',
    start_timestamp: appStartTimeMilliseconds / 1000,
    contexts: expect.objectContaining({
      trace: expect.objectContaining({
        op: UI_LOAD,
        data: expect.objectContaining({
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: UI_LOAD,
        }),
      }),
    }),
    measurements: expect.objectContaining({
      [APP_START_COLD_MEASUREMENT]: {
        value: timeOriginMilliseconds - appStartTimeMilliseconds,
        unit: 'millisecond',
      },
    }),
    spans: expect.arrayContaining<SpanJSON>([
      {
        op: APP_START_COLD_OP,
        description: 'Cold App Start',
        start_timestamp: appStartTimeMilliseconds / 1000,
        timestamp: expect.any(Number),
        trace_id: expect.any(String),
        span_id: expect.any(String),
        parent_span_id: '123',
        origin: 'auto',
        status: 'ok',
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: APP_START_COLD_OP,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto',
        },
      },
      {
        start_timestamp: 100,
        timestamp: 200,
        op: 'test',
        description: 'Test',
        span_id: '123',
        trace_id: '456',
      },
    ]),
  });
}

function expectEventWithWarmAppStart(
  event: Event,
  {
    timeOriginMilliseconds,
    appStartTimeMilliseconds,
  }: {
    timeOriginMilliseconds: number;
    appStartTimeMilliseconds: number;
  },
) {
  return expect.objectContaining<TransactionEvent>({
    type: 'transaction',
    start_timestamp: appStartTimeMilliseconds / 1000,
    contexts: expect.objectContaining({
      trace: expect.objectContaining({
        op: UI_LOAD,
        data: expect.objectContaining({
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: UI_LOAD,
        }),
      }),
    }),
    measurements: expect.objectContaining({
      [APP_START_WARM_MEASUREMENT]: {
        value: timeOriginMilliseconds - appStartTimeMilliseconds,
        unit: 'millisecond',
      },
    }),
    spans: expect.arrayContaining<SpanJSON>([
      {
        op: APP_START_WARM_OP,
        description: 'Warm App Start',
        start_timestamp: appStartTimeMilliseconds / 1000,
        timestamp: expect.any(Number),
        trace_id: expect.any(String),
        span_id: expect.any(String),
        parent_span_id: '123',
        origin: 'auto',
        status: 'ok',
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: APP_START_WARM_OP,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto',
        },
      },
      {
        start_timestamp: 100,
        timestamp: 200,
        op: 'test',
        description: 'Test',
        span_id: '123',
        trace_id: '456',
      },
    ]),
  });
}

function mockAppStart({
  cold = false,
  has_fetched = false,
  enableNativeSpans = false,
  customNativeSpans = [],
}: {
  cold?: boolean;
  has_fetched?: boolean;
  enableNativeSpans?: boolean;
  customNativeSpans?: NativeAppStartResponse['spans'];
}) {
  const timeOriginMilliseconds = Date.now();
  const appStartTimeMilliseconds = timeOriginMilliseconds - 100;
  const mockAppStartResponse: NativeAppStartResponse = {
    type: cold ? 'cold' : 'warm',
    app_start_timestamp_ms: appStartTimeMilliseconds,
    has_fetched: has_fetched,
    spans: enableNativeSpans
      ? [
          {
            description: 'test native app start span',
            start_timestamp_ms: timeOriginMilliseconds - 100,
            end_timestamp_ms: timeOriginMilliseconds - 50,
          },
          ...customNativeSpans,
        ]
      : [],
  };

  setAppStartEndTimestampMs(timeOriginMilliseconds);
  mockFunction(getTimeOriginMilliseconds).mockReturnValue(timeOriginMilliseconds);
  mockFunction(NATIVE.fetchNativeAppStart).mockResolvedValue(mockAppStartResponse);

  return [timeOriginMilliseconds, appStartTimeMilliseconds];
}

function mockTooLongAppStart() {
  const timeOriginMilliseconds = Date.now();
  const appStartTimeMilliseconds = timeOriginMilliseconds - 65000;
  const mockAppStartResponse: NativeAppStartResponse = {
    type: 'warm',
    app_start_timestamp_ms: appStartTimeMilliseconds,
    has_fetched: false,
    spans: [],
  };

  setAppStartEndTimestampMs(timeOriginMilliseconds);
  mockFunction(getTimeOriginMilliseconds).mockReturnValue(timeOriginMilliseconds);
  mockFunction(NATIVE.fetchNativeAppStart).mockResolvedValue(mockAppStartResponse);

  return [timeOriginMilliseconds, appStartTimeMilliseconds];
}

function mockTooOldAppStart() {
  const timeOriginMilliseconds = Date.now();
  const appStartTimeMilliseconds = timeOriginMilliseconds - 65000;
  const mockAppStartResponse: NativeAppStartResponse = {
    type: 'warm',
    app_start_timestamp_ms: appStartTimeMilliseconds,
    has_fetched: false,
    spans: [],
  };

  // App start finish timestamp
  setAppStartEndTimestampMs(timeOriginMilliseconds);
  mockFunction(getTimeOriginMilliseconds).mockReturnValue(timeOriginMilliseconds - 64000);
  mockFunction(NATIVE.fetchNativeAppStart).mockResolvedValue(mockAppStartResponse);
  // Transaction start timestamp
  mockFunction(timestampInSeconds).mockReturnValue(timeOriginMilliseconds / 1000 + 65);

  return [timeOriginMilliseconds, appStartTimeMilliseconds];
}

/**
 * Mocks RN Bundle Start Module
 * `var __BUNDLE_START_TIME__=this.nativePerformanceNow?nativePerformanceNow():Date.now()`
 */
function mockReactNativeBundleExecutionStartTimestamp() {
  RN_GLOBAL_OBJ.nativePerformanceNow = () => 100; // monotonic clock like `performance.now()`
  RN_GLOBAL_OBJ.__BUNDLE_START_TIME__ = 50; // 50ms after time origin
}

/**
 * Removes mock added by mockReactNativeBundleExecutionStartTimestamp
 */
function clearReactNativeBundleExecutionStartTimestamp() {
  delete RN_GLOBAL_OBJ.nativePerformanceNow;
  delete RN_GLOBAL_OBJ.__BUNDLE_START_TIME__;
}

function set__DEV__(value: boolean) {
  Object.defineProperty(globalThis, '__DEV__', {
    value,
    writable: true,
  });
}
