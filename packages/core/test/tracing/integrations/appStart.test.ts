import type { ErrorEvent, Event, Integration, SpanJSON, TransactionEvent } from '@sentry/core';
import {
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  setCurrentClient,
  timestampInSeconds,
} from '@sentry/core';

import {
  APP_START_COLD as APP_START_COLD_MEASUREMENT,
  APP_START_WARM as APP_START_WARM_MEASUREMENT,
} from '../../../src/js/measurements';
import type { NativeAppStartResponse } from '../../../src/js/NativeRNSentry';
import {
  APP_START_COLD as APP_START_COLD_OP,
  APP_START_WARM as APP_START_WARM_OP,
  UI_LOAD,
} from '../../../src/js/tracing';
import {
  _clearRootComponentCreationTimestampMs,
  _setAppStartEndTimestampMs,
  _setRootComponentCreationTimestampMs,
  appStartIntegration,
  setRootComponentCreationTimestampMs,
} from '../../../src/js/tracing/integrations/appStart';
import { SPAN_ORIGIN_AUTO_APP_START, SPAN_ORIGIN_MANUAL_APP_START } from '../../../src/js/tracing/origin';
import { SPAN_THREAD_NAME, SPAN_THREAD_NAME_MAIN } from '../../../src/js/tracing/span';
import { getTimeOriginMilliseconds } from '../../../src/js/tracing/utils';
import { RN_GLOBAL_OBJ } from '../../../src/js/utils/worldwide';
import { NATIVE } from '../../../src/js/wrapper';
import { mockAppRegistryIntegration } from '../../mocks/appRegistryIntegrationMock';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';
import { mockFunction } from '../../testutils';

type AppStartIntegrationTest = ReturnType<typeof appStartIntegration> & {
  setFirstStartedActiveRootSpanId: (spanId: string | undefined) => void;
};

let dateNowSpy: jest.SpyInstance;

jest.mock('../../../src/js/wrapper', () => {
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

jest.mock('../../../src/js/tracing/utils', () => {
  const originalUtils = jest.requireActual('../../../src/js/tracing/utils');

  return {
    ...originalUtils,
    getTimeOriginMilliseconds: jest.fn(),
  };
});

jest.mock('@sentry/core', () => {
  const originalUtils = jest.requireActual('@sentry/core');

  return {
    ...originalUtils,
    timestampInSeconds: jest.fn(originalUtils.timestampInSeconds),
  };
});

describe('App Start Integration', () => {
  beforeEach(() => {
    mockReactNativeBundleExecutionStartTimestamp();
    jest.clearAllMocks();
  });

  afterEach(() => {
    clearReactNativeBundleExecutionStartTimestamp();
  });

  describe('Standalone App Start', () => {
    it('Adds Cold App Start Span to Active Span', async () => {
      const [timeOriginMilliseconds, appStartTimeMilliseconds] = mockAppStart({ cold: true });

      const actualEvent = await captureStandAloneAppStart();
      expect(actualEvent).toEqual(
        expectEventWithStandaloneColdAppStart(actualEvent, { timeOriginMilliseconds, appStartTimeMilliseconds }),
      );
    });

    it('Adds Warm App Start Span to Active Span', async () => {
      const [timeOriginMilliseconds, appStartTimeMilliseconds] = mockAppStart({ cold: false });

      const actualEvent = await captureStandAloneAppStart();
      expect(actualEvent).toEqual(
        expectEventWithStandaloneWarmAppStart(actualEvent, { timeOriginMilliseconds, appStartTimeMilliseconds }),
      );
    });

    it('Does not add any spans or measurements when App Start Span is longer than threshold', async () => {
      set__DEV__(false);
      mockTooLongAppStart();

      const actualEvent = await captureStandAloneAppStart();
      expect(actualEvent).toStrictEqual(undefined);
    });

    it('Does add App Start Span spans and measurements longer than threshold in development builds', async () => {
      set__DEV__(true);
      const [timeOriginMilliseconds, appStartTimeMilliseconds] = mockTooLongAppStart();

      const actualEvent = await captureStandAloneAppStart();
      expect(actualEvent).toEqual(
        expectEventWithStandaloneWarmAppStart(actualEvent, { timeOriginMilliseconds, appStartTimeMilliseconds }),
      );
    });

    it('Does not add App Start Span older than threshold', async () => {
      set__DEV__(false);
      mockTooOldAppStart();

      const actualEvent = await captureStandAloneAppStart();
      expect(actualEvent).toStrictEqual(undefined);
    });

    it('Does add App Start Span older than threshold in development builds', async () => {
      set__DEV__(true);
      const [timeOriginMilliseconds, appStartTimeMilliseconds, appStartDurationMilliseconds] = mockTooOldAppStart();

      const actualEvent = await captureStandAloneAppStart();
      expect(actualEvent).toEqual(
        expectEventWithStandaloneWarmAppStart(actualEvent, {
          timeOriginMilliseconds,
          appStartTimeMilliseconds,
          appStartDurationMilliseconds,
        }),
      );
    });

    it('Does not create app start transaction if has_fetched == true', async () => {
      mockAppStart({ has_fetched: true });

      const actualEvent = await captureStandAloneAppStart();
      expect(actualEvent).toStrictEqual(undefined);
    });

    it('Does not add bundle execution span when bundle start time is missing', async () => {
      clearReactNativeBundleExecutionStartTimestamp();

      const actualEvent = await captureStandAloneAppStart();
      expect(actualEvent).toStrictEqual(undefined);
    });

    it('Adds bundle execution span', async () => {
      _clearRootComponentCreationTimestampMs();
      mockReactNativeBundleExecutionStartTimestamp();
      const [timeOriginMilliseconds] = mockAppStart({ cold: true });

      const actualEvent = await captureStandAloneAppStart();

      const appStartRootSpan = actualEvent!.spans!.find(({ description }) => description === 'Cold App Start');
      const bundleStartSpan = actualEvent!.spans!.find(
        ({ description }) => description === 'JS Bundle Execution Start',
      );

      expect(appStartRootSpan).toEqual(
        expect.objectContaining(<Partial<SpanJSON>>{
          span_id: expect.any(String),
          description: 'Cold App Start',
          op: APP_START_COLD_OP,
          data: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: APP_START_COLD_OP,
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_APP_START,
          },
        }),
      );
      expect(bundleStartSpan).toEqual(
        expect.objectContaining(<Partial<SpanJSON>>{
          description: 'JS Bundle Execution Start',
          start_timestamp: expect.closeTo((timeOriginMilliseconds - 50) / 1000),
          timestamp: expect.closeTo((timeOriginMilliseconds - 50) / 1000),
          parent_span_id: appStartRootSpan!.span_id, // parent is the root app start span
          op: appStartRootSpan!.op, // op is the same as the root app start span
          data: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: appStartRootSpan!.op,
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_APP_START,
          },
        }),
      );
    });

    it('adds bundle execution before react root via private api (used by Sentry.wrap())', async () => {
      mockReactNativeBundleExecutionStartTimestamp();
      const [timeOriginMilliseconds] = mockAppStart({ cold: true });
      _setRootComponentCreationTimestampMs(timeOriginMilliseconds - 10);

      const actualEvent = await captureStandAloneAppStart();

      const appStartRootSpan = actualEvent!.spans!.find(({ description }) => description === 'Cold App Start');
      const bundleStartSpan = actualEvent!.spans!.find(
        ({ description }) => description === 'JS Bundle Execution Before React Root',
      );

      expect(appStartRootSpan).toEqual(
        expect.objectContaining(<Partial<SpanJSON>>{
          span_id: expect.any(String),
          description: 'Cold App Start',
          op: APP_START_COLD_OP,
          data: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: APP_START_COLD_OP,
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_APP_START,
          },
        }),
      );
      expect(bundleStartSpan).toEqual(
        expect.objectContaining(<Partial<SpanJSON>>{
          description: 'JS Bundle Execution Before React Root',
          start_timestamp: expect.closeTo((timeOriginMilliseconds - 50) / 1000),
          timestamp: (timeOriginMilliseconds - 10) / 1000,
          parent_span_id: appStartRootSpan!.span_id, // parent is the root app start span
          op: appStartRootSpan!.op, // op is the same as the root app start span
          data: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: appStartRootSpan!.op,
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_APP_START,
          },
        }),
      );
    });

    it('adds native spans as a child of the main app start span', async () => {
      const [timeOriginMilliseconds] = mockAppStart({
        cold: true,
        enableNativeSpans: true,
      });

      const actualEvent = await captureStandAloneAppStart();

      const appStartRootSpan = actualEvent!.spans!.find(({ description }) => description === 'Cold App Start');
      const nativeSpan = actualEvent!.spans!.find(({ description }) => description === 'test native app start span');

      expect(appStartRootSpan).toEqual(
        expect.objectContaining(<Partial<SpanJSON>>{
          span_id: expect.any(String),
          description: 'Cold App Start',
          op: APP_START_COLD_OP,
          data: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: APP_START_COLD_OP,
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_APP_START,
          },
        }),
      );
      expect(nativeSpan).toEqual(
        expect.objectContaining(<Partial<SpanJSON>>{
          description: 'test native app start span',
          start_timestamp: (timeOriginMilliseconds - 100) / 1000,
          timestamp: (timeOriginMilliseconds - 50) / 1000,
          parent_span_id: appStartRootSpan!.span_id, // parent is the root app start span
          op: appStartRootSpan!.op, // op is the same as the root app start span
          data: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: appStartRootSpan!.op,
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_APP_START,
            [SPAN_THREAD_NAME]: SPAN_THREAD_NAME_MAIN,
          },
        }),
      );
    });

    it('adds ui kit init full length as a child of the main app start span', async () => {
      const timeOriginMilliseconds = Date.now();
      mockAppStart({
        cold: true,
        enableNativeSpans: true,
        customNativeSpans: [
          {
            description: 'UIKit init', // init with lower case is emitted by the native layer
            start_timestamp_ms: timeOriginMilliseconds - 100,
            end_timestamp_ms: timeOriginMilliseconds - 60,
          },
        ],
      });
      mockReactNativeBundleExecutionStartTimestamp();

      const actualEvent = await captureStandAloneAppStart();

      const nativeSpan = actualEvent!.spans!.find(({ description }) => description?.startsWith('UIKit Init'));

      expect(nativeSpan).toBeDefined();
      expect(nativeSpan).toEqual(
        expect.objectContaining(<Partial<SpanJSON>>{
          description: 'UIKit Init',
          start_timestamp: (timeOriginMilliseconds - 100) / 1000,
          timestamp: (timeOriginMilliseconds - 60) / 1000,
          origin: SPAN_ORIGIN_AUTO_APP_START,
          data: expect.objectContaining({
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_APP_START,
          }),
        }),
      );
    });

    it('adds ui kit init start mark as a child of the main app start span', async () => {
      const timeOriginMilliseconds = Date.now();
      mockAppStart({
        cold: true,
        enableNativeSpans: true,
        customNativeSpans: [
          {
            description: 'UIKit init', // init with lower case is emitted by the native layer
            start_timestamp_ms: timeOriginMilliseconds - 100,
            end_timestamp_ms: timeOriginMilliseconds - 20, // After mocked bundle execution start
          },
        ],
      });
      mockReactNativeBundleExecutionStartTimestamp();

      const actualEvent = await captureStandAloneAppStart();

      const nativeRuntimeInitSpan = actualEvent!.spans!.find(({ description }) =>
        description?.startsWith('UIKit Init to JS Exec Start'),
      );

      expect(nativeRuntimeInitSpan).toBeDefined();
      expect(nativeRuntimeInitSpan).toEqual(
        expect.objectContaining(<Partial<SpanJSON>>{
          description: 'UIKit Init to JS Exec Start',
          start_timestamp: (timeOriginMilliseconds - 100) / 1000,
          timestamp: expect.closeTo((timeOriginMilliseconds - 50) / 1000),
          origin: SPAN_ORIGIN_AUTO_APP_START,
          data: expect.objectContaining({
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_APP_START,
          }),
        }),
      );
    });

    it('Does not add app start span twice', async () => {
      getCurrentScope().clear();
      getIsolationScope().clear();
      getGlobalScope().clear();

      const [timeOriginMilliseconds, appStartTimeMilliseconds] = mockAppStart({ cold: true });

      const integration = appStartIntegration({
        standalone: true,
      });
      const client = new TestClient({
        ...getDefaultTestClientOptions(),
        tracesSampleRate: 1.0,
        enableAppStartTracking: true,
      });
      setCurrentClient(client);

      integration.setup(client);
      await integration.captureStandaloneAppStart();
      const actualEvent = client.event;
      expect(actualEvent).toEqual(
        expectEventWithStandaloneColdAppStart(actualEvent, { timeOriginMilliseconds, appStartTimeMilliseconds }),
      );

      client.event = undefined;
      await integration.captureStandaloneAppStart();
      const secondEvent = client.event;
      expect(secondEvent).toBe(undefined);
    });

    it('Does not add app start span when marked as fetched from the native layer', async () => {
      mockFunction(NATIVE.fetchNativeAppStart).mockResolvedValue({
        type: 'cold',
        has_fetched: true,
        spans: [],
      });

      const actualEvent = await captureStandAloneAppStart();
      expect(actualEvent).toStrictEqual(undefined);
      expect(NATIVE.fetchNativeAppStart).toBeCalledTimes(1);
    });

    it('Does not add app start if native returns null', async () => {
      mockFunction(NATIVE.fetchNativeAppStart).mockResolvedValue(null);

      const actualEvent = await captureStandAloneAppStart();
      expect(actualEvent).toStrictEqual(undefined);
      expect(NATIVE.fetchNativeAppStart).toBeCalledTimes(1);
    });
  });

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
        expectEventWithAttachedColdAppStart({ timeOriginMilliseconds, appStartTimeMilliseconds }),
      );
    });

    it('Adds Warm App Start Span to Active Span', async () => {
      const [timeOriginMilliseconds, appStartTimeMilliseconds] = mockAppStart({ cold: false });

      const actualEvent = await processEvent(getMinimalTransactionEvent());
      expect(actualEvent).toEqual(
        expectEventWithAttachedWarmAppStart({ timeOriginMilliseconds, appStartTimeMilliseconds }),
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
        expectEventWithAttachedWarmAppStart({ timeOriginMilliseconds, appStartTimeMilliseconds }),
      );
    });

    it('Does not add App Start Span older than threshold', async () => {
      set__DEV__(false);
      const [timeOriginMilliseconds] = mockTooOldAppStart();

      const actualEvent = await processEvent(
        getMinimalTransactionEvent({ startTimestampSeconds: timeOriginMilliseconds }),
      );
      expect(actualEvent).toStrictEqual(getMinimalTransactionEvent({ startTimestampSeconds: timeOriginMilliseconds }));
    });

    it('Does add App Start Span older than threshold in development builds', async () => {
      set__DEV__(true);
      const [timeOriginMilliseconds, appStartTimeMilliseconds, appStartDurationMilliseconds] = mockTooOldAppStart();

      const actualEvent = await processEvent(
        getMinimalTransactionEvent({ startTimestampSeconds: timeOriginMilliseconds }),
      );
      expect(actualEvent).toEqual(
        expectEventWithAttachedWarmAppStart({
          timeOriginMilliseconds,
          appStartTimeMilliseconds,
          appStartDurationMilliseconds,
        }),
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
      _clearRootComponentCreationTimestampMs();
      mockReactNativeBundleExecutionStartTimestamp();
      const [timeOriginMilliseconds] = mockAppStart({ cold: true });

      const actualEvent = await processEvent(getMinimalTransactionEvent());

      const appStartRootSpan = actualEvent!.spans!.find(({ description }) => description === 'Cold App Start');
      const bundleStartSpan = actualEvent!.spans!.find(
        ({ description }) => description === 'JS Bundle Execution Start',
      );

      expect(appStartRootSpan).toEqual(
        expect.objectContaining(<Partial<SpanJSON>>{
          description: 'Cold App Start',
          span_id: expect.any(String),
          op: APP_START_COLD_OP,
          origin: SPAN_ORIGIN_AUTO_APP_START,
          data: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: APP_START_COLD_OP,
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_APP_START,
          },
        }),
      );
      expect(bundleStartSpan).toEqual(
        expect.objectContaining(<Partial<SpanJSON>>{
          description: 'JS Bundle Execution Start',
          start_timestamp: expect.closeTo((timeOriginMilliseconds - 50) / 1000),
          timestamp: expect.closeTo((timeOriginMilliseconds - 50) / 1000),
          parent_span_id: appStartRootSpan!.span_id, // parent is the root app start span
          op: appStartRootSpan!.op, // op is the same as the root app start span
          origin: SPAN_ORIGIN_AUTO_APP_START,
          data: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: appStartRootSpan!.op,
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_APP_START,
          },
        }),
      );
    });

    it('adds bundle execution before react root via public api', async () => {
      mockReactNativeBundleExecutionStartTimestamp();
      const [timeOriginMilliseconds] = mockAppStart({ cold: true });
      setRootComponentCreationTimestampMs(timeOriginMilliseconds - 10);

      const actualEvent = await processEvent(getMinimalTransactionEvent());

      const appStartRootSpan = actualEvent!.spans!.find(({ description }) => description === 'Cold App Start');
      const bundleStartSpan = actualEvent!.spans!.find(
        ({ description }) => description === 'JS Bundle Execution Before React Root',
      );

      expect(appStartRootSpan).toEqual(
        expect.objectContaining(<Partial<SpanJSON>>{
          description: 'Cold App Start',
          span_id: expect.any(String),
          op: APP_START_COLD_OP,
          origin: SPAN_ORIGIN_AUTO_APP_START,
          data: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: APP_START_COLD_OP,
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_APP_START,
          },
        }),
      );
      expect(bundleStartSpan).toEqual(
        expect.objectContaining(<Partial<SpanJSON>>{
          description: 'JS Bundle Execution Before React Root',
          start_timestamp: expect.closeTo((timeOriginMilliseconds - 50) / 1000),
          timestamp: (timeOriginMilliseconds - 10) / 1000,
          parent_span_id: appStartRootSpan!.span_id, // parent is the root app start span
          op: appStartRootSpan!.op, // op is the same as the root app start span
          origin: SPAN_ORIGIN_MANUAL_APP_START,
          data: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: appStartRootSpan!.op,
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_MANUAL_APP_START,
          },
        }),
      );
    });

    it('adds bundle execution before react root via private api (used by Sentry.wrap())', async () => {
      mockReactNativeBundleExecutionStartTimestamp();
      const [timeOriginMilliseconds] = mockAppStart({ cold: true });
      _setRootComponentCreationTimestampMs(timeOriginMilliseconds - 10);

      const actualEvent = await processEvent(getMinimalTransactionEvent());

      const appStartRootSpan = actualEvent!.spans!.find(({ description }) => description === 'Cold App Start');
      const bundleStartSpan = actualEvent!.spans!.find(
        ({ description }) => description === 'JS Bundle Execution Before React Root',
      );

      expect(appStartRootSpan).toEqual(
        expect.objectContaining(<Partial<SpanJSON>>{
          description: 'Cold App Start',
          span_id: expect.any(String),
          op: APP_START_COLD_OP,
          origin: SPAN_ORIGIN_AUTO_APP_START,
          data: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: APP_START_COLD_OP,
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_APP_START,
          },
        }),
      );
      expect(bundleStartSpan).toEqual(
        expect.objectContaining(<Partial<SpanJSON>>{
          description: 'JS Bundle Execution Before React Root',
          start_timestamp: expect.closeTo((timeOriginMilliseconds - 50) / 1000),
          timestamp: (timeOriginMilliseconds - 10) / 1000,
          parent_span_id: appStartRootSpan!.span_id, // parent is the root app start span
          op: appStartRootSpan!.op, // op is the same as the root app start span
          origin: SPAN_ORIGIN_AUTO_APP_START,
          data: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: appStartRootSpan!.op,
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_APP_START,
          },
        }),
      );
    });

    it('adds native spans as a child of the main app start span', async () => {
      const [timeOriginMilliseconds] = mockAppStart({
        cold: true,
        enableNativeSpans: true,
      });

      const actualEvent = await processEvent(getMinimalTransactionEvent());

      const appStartRootSpan = actualEvent!.spans!.find(({ description }) => description === 'Cold App Start');
      const nativeSpan = actualEvent!.spans!.find(({ description }) => description === 'test native app start span');

      expect(appStartRootSpan).toEqual(
        expect.objectContaining(<Partial<SpanJSON>>{
          description: 'Cold App Start',
          span_id: expect.any(String),
          op: APP_START_COLD_OP,
          origin: SPAN_ORIGIN_AUTO_APP_START,
          data: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: APP_START_COLD_OP,
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_APP_START,
          },
        }),
      );
      expect(nativeSpan).toEqual(
        expect.objectContaining(<Partial<SpanJSON>>{
          description: 'test native app start span',
          start_timestamp: (timeOriginMilliseconds - 100) / 1000,
          timestamp: (timeOriginMilliseconds - 50) / 1000,
          parent_span_id: appStartRootSpan!.span_id, // parent is the root app start span
          op: appStartRootSpan!.op, // op is the same as the root app start span
          origin: SPAN_ORIGIN_AUTO_APP_START,
          data: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: appStartRootSpan!.op,
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_APP_START,
            [SPAN_THREAD_NAME]: SPAN_THREAD_NAME_MAIN,
          },
        }),
      );
    });

    it('adds ui kit init full length as a child of the main app start span', async () => {
      const timeOriginMilliseconds = Date.now();
      mockAppStart({
        cold: true,
        enableNativeSpans: true,
        customNativeSpans: [
          {
            description: 'UIKit init', // init with lower case is emitted by the native layer
            start_timestamp_ms: timeOriginMilliseconds - 100,
            end_timestamp_ms: timeOriginMilliseconds - 60,
          },
        ],
      });
      mockReactNativeBundleExecutionStartTimestamp();

      const actualEvent = await processEvent(getMinimalTransactionEvent());

      const nativeSpan = actualEvent!.spans!.find(({ description }) => description?.startsWith('UIKit Init'));

      expect(nativeSpan).toBeDefined();
      expect(nativeSpan).toEqual(
        expect.objectContaining(<Partial<SpanJSON>>{
          description: 'UIKit Init',
          start_timestamp: (timeOriginMilliseconds - 100) / 1000,
          timestamp: (timeOriginMilliseconds - 60) / 1000,
          data: expect.objectContaining({
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_APP_START,
          }),
        }),
      );
    });

    it('adds ui kit init start mark as a child of the main app start span', async () => {
      const timeOriginMilliseconds = Date.now();
      mockAppStart({
        cold: true,
        enableNativeSpans: true,
        customNativeSpans: [
          {
            description: 'UIKit init', // init with lower case is emitted by the native layer
            start_timestamp_ms: timeOriginMilliseconds - 100,
            end_timestamp_ms: timeOriginMilliseconds - 20, // After mocked bundle execution start
          },
        ],
      });
      mockReactNativeBundleExecutionStartTimestamp();

      const actualEvent = await processEvent(getMinimalTransactionEvent());

      const nativeRuntimeInitSpan = actualEvent!.spans!.find(({ description }) =>
        description?.startsWith('UIKit Init to JS Exec Start'),
      );

      expect(nativeRuntimeInitSpan).toBeDefined();
      expect(nativeRuntimeInitSpan).toEqual(
        expect.objectContaining(<Partial<SpanJSON>>{
          description: 'UIKit Init to JS Exec Start',
          start_timestamp: (timeOriginMilliseconds - 100) / 1000,
          timestamp: expect.closeTo((timeOriginMilliseconds - 50) / 1000),
          data: expect.objectContaining({
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_APP_START,
          }),
        }),
      );
    });

    it('run application before initial app start is flushed is ignored, app start is attached only once', async () => {
      const { mockedOnRunApplication } = mockAppRegistryIntegration();
      mockAppStart({ cold: true });

      const event = getMinimalTransactionEvent();
      const integration = setupIntegration();
      (integration as AppStartIntegrationTest).setFirstStartedActiveRootSpanId(event.contexts?.trace?.span_id);

      const registerAppStartCallback = mockedOnRunApplication.mock.calls[0][0];
      registerAppStartCallback();

      const actualFirstEvent = await processEventWithIntegration(integration, event);
      const actualSecondEvent = await processEventWithIntegration(integration, getMinimalTransactionEvent());

      expect(actualFirstEvent.measurements[APP_START_COLD_MEASUREMENT]).toBeDefined();
      expect(actualSecondEvent.measurements).toBeUndefined();
    });

    it('run application after initial app start is flushed allows attaching app start to the next root span', async () => {
      const { mockedOnRunApplication } = mockAppRegistryIntegration();
      mockAppStart({ cold: true });

      const firstEvent = getMinimalTransactionEvent();
      const integration = setupIntegration();
      (integration as AppStartIntegrationTest).setFirstStartedActiveRootSpanId(firstEvent.contexts?.trace?.span_id);

      const actualFirstEvent = await processEventWithIntegration(integration, firstEvent);

      const registerAppStartCallback = mockedOnRunApplication.mock.calls[0][0];
      registerAppStartCallback();

      mockAppStart({ cold: false });
      const secondEvent = getMinimalTransactionEvent();
      (integration as AppStartIntegrationTest).setFirstStartedActiveRootSpanId(secondEvent.contexts?.trace?.span_id);
      const actualSecondEvent = await processEventWithIntegration(integration, secondEvent);

      expect(actualFirstEvent.measurements[APP_START_COLD_MEASUREMENT]).toBeDefined();
      expect(actualSecondEvent.measurements[APP_START_WARM_MEASUREMENT]).toBeDefined();
    });

    it('Does not add app start span if app start end timestamp is before app start timestamp', async () => {
      mockAppStart({ cold: true, appStartEndTimestampMs: Date.now() - 1000 });

      const actualEvent = await processEvent(getMinimalTransactionEvent());
      expect(actualEvent.measurements).toBeUndefined();
    });

    it('Does not add app start span twice', async () => {
      const [timeOriginMilliseconds, appStartTimeMilliseconds] = mockAppStart({ cold: true });

      const integration = appStartIntegration();
      const client = new TestClient(getDefaultTestClientOptions());

      const firstEvent = getMinimalTransactionEvent();
      (integration as AppStartIntegrationTest).setFirstStartedActiveRootSpanId(firstEvent.contexts?.trace?.span_id);

      const actualEvent = await integration.processEvent(firstEvent, {}, client);
      expect(actualEvent).toEqual(
        expectEventWithAttachedColdAppStart({ timeOriginMilliseconds, appStartTimeMilliseconds }),
      );

      const secondEvent = await integration.processEvent(getMinimalTransactionEvent(), {}, client);
      expect(secondEvent).toStrictEqual(getMinimalTransactionEvent());
    });

    it('Does not add app start span when marked as fetched from the native layer', async () => {
      mockFunction(NATIVE.fetchNativeAppStart).mockResolvedValue({
        type: 'cold',
        has_fetched: true,
        spans: [],
      });

      const actualEvent = await processEvent(getMinimalTransactionEvent());
      expect(actualEvent).toStrictEqual(getMinimalTransactionEvent());
      expect(NATIVE.fetchNativeAppStart).toBeCalledTimes(1);
    });

    it('Does not add app start if native returns null', async () => {
      mockFunction(NATIVE.fetchNativeAppStart).mockResolvedValue(null);

      const actualEvent = await processEvent(getMinimalTransactionEvent());
      expect(actualEvent).toStrictEqual(getMinimalTransactionEvent());
      expect(NATIVE.fetchNativeAppStart).toBeCalledTimes(1);
    });
  });
});

function setupIntegration() {
  const client = new TestClient(getDefaultTestClientOptions());
  const integration = appStartIntegration();
  integration.afterAllSetup(client);

  return integration;
}

function processEventWithIntegration(integration: Integration, event: Event) {
  return integration.processEvent(event, {}, new TestClient(getDefaultTestClientOptions()));
}

function processEvent(event: Event): PromiseLike<Event | null> | Event | null {
  const integration = setupIntegration();
  (integration as AppStartIntegrationTest).setFirstStartedActiveRootSpanId(event.contexts?.trace?.span_id);
  return processEventWithIntegration(integration, event);
}

async function captureStandAloneAppStart(): Promise<PromiseLike<Event | null> | Event | null> {
  getCurrentScope().clear();
  getIsolationScope().clear();
  getGlobalScope().clear();

  const integration = appStartIntegration({
    standalone: true,
  });
  const client = new TestClient({
    ...getDefaultTestClientOptions(),
    enableAppStartTracking: true,
    tracesSampleRate: 1.0,
  });
  setCurrentClient(client);
  integration.setup(client);
  await integration.captureStandaloneAppStart();

  return client.event;
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

function expectEventWithAttachedColdAppStart({
  timeOriginMilliseconds,
  appStartTimeMilliseconds,
}: {
  timeOriginMilliseconds: number;
  appStartTimeMilliseconds: number;
}) {
  return expect.objectContaining<TransactionEvent>({
    type: 'transaction',
    start_timestamp: appStartTimeMilliseconds / 1000,
    contexts: expect.objectContaining({
      trace: expect.objectContaining({
        op: UI_LOAD,
        origin: SPAN_ORIGIN_AUTO_APP_START,
        data: expect.objectContaining({
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: UI_LOAD,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_APP_START,
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
        origin: SPAN_ORIGIN_AUTO_APP_START,
        status: 'ok',
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: APP_START_COLD_OP,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_APP_START,
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

function expectEventWithAttachedWarmAppStart({
  timeOriginMilliseconds,
  appStartTimeMilliseconds,
  appStartDurationMilliseconds,
}: {
  timeOriginMilliseconds: number;
  appStartTimeMilliseconds: number;
  appStartDurationMilliseconds?: number;
}) {
  return expect.objectContaining<TransactionEvent>({
    type: 'transaction',
    start_timestamp: appStartTimeMilliseconds / 1000,
    contexts: expect.objectContaining({
      trace: expect.objectContaining({
        op: UI_LOAD,
        origin: SPAN_ORIGIN_AUTO_APP_START,
        data: expect.objectContaining({
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: UI_LOAD,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_APP_START,
        }),
      }),
    }),
    measurements: expect.objectContaining({
      [APP_START_WARM_MEASUREMENT]: {
        value: appStartDurationMilliseconds || timeOriginMilliseconds - appStartTimeMilliseconds,
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
        origin: SPAN_ORIGIN_AUTO_APP_START,
        status: 'ok',
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: APP_START_WARM_OP,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_APP_START,
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

function expectEventWithStandaloneColdAppStart(
  actualEvent: Event,
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
        origin: SPAN_ORIGIN_AUTO_APP_START,
        data: expect.objectContaining({
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: UI_LOAD,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_APP_START,
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
        parent_span_id: actualEvent!.contexts!.trace!.span_id,
        origin: SPAN_ORIGIN_AUTO_APP_START,
        status: 'ok',
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: APP_START_COLD_OP,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_APP_START,
        },
      },
    ]),
  });
}

function expectEventWithStandaloneWarmAppStart(
  actualEvent: Event,
  {
    timeOriginMilliseconds,
    appStartTimeMilliseconds,
    appStartDurationMilliseconds,
  }: {
    timeOriginMilliseconds: number;
    appStartTimeMilliseconds: number;
    appStartDurationMilliseconds?: number;
  },
) {
  return expect.objectContaining<TransactionEvent>({
    type: 'transaction',
    start_timestamp: appStartTimeMilliseconds / 1000,
    contexts: expect.objectContaining({
      trace: expect.objectContaining({
        op: UI_LOAD,
        origin: SPAN_ORIGIN_AUTO_APP_START,
        data: expect.objectContaining({
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: UI_LOAD,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_APP_START,
        }),
      }),
    }),
    measurements: expect.objectContaining({
      [APP_START_WARM_MEASUREMENT]: {
        value: appStartDurationMilliseconds || timeOriginMilliseconds - appStartTimeMilliseconds,
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
        parent_span_id: actualEvent!.contexts!.trace!.span_id,
        origin: SPAN_ORIGIN_AUTO_APP_START,
        status: 'ok',
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: APP_START_WARM_OP,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_APP_START,
        },
      },
    ]),
  });
}

function mockAppStart({
  cold = false,
  has_fetched = false,
  enableNativeSpans = false,
  customNativeSpans = [],
  appStartEndTimestampMs = undefined,
}: {
  cold?: boolean;
  has_fetched?: boolean;
  enableNativeSpans?: boolean;
  customNativeSpans?: NativeAppStartResponse['spans'];
  appStartEndTimestampMs?: number;
} = {}) {
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

  _setAppStartEndTimestampMs(appStartEndTimestampMs || timeOriginMilliseconds);
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

  _setAppStartEndTimestampMs(timeOriginMilliseconds);
  mockFunction(getTimeOriginMilliseconds).mockReturnValue(timeOriginMilliseconds);
  mockFunction(NATIVE.fetchNativeAppStart).mockResolvedValue(mockAppStartResponse);

  return [timeOriginMilliseconds, appStartTimeMilliseconds];
}

function mockTooOldAppStart() {
  const timeOriginMilliseconds = Date.now();
  // Ensures app start is old (more than 1 minute before transaction start)
  const appStartTimeMilliseconds = timeOriginMilliseconds - 65000;
  const appStartEndTimestampMilliseconds = appStartTimeMilliseconds + 5000;
  const appStartDurationMilliseconds = appStartEndTimestampMilliseconds - appStartTimeMilliseconds;
  const mockAppStartResponse: NativeAppStartResponse = {
    type: 'warm',
    app_start_timestamp_ms: appStartTimeMilliseconds,
    has_fetched: false,
    spans: [],
  };

  // App start finish timestamp
  // App start length is 5 seconds
  _setAppStartEndTimestampMs(appStartEndTimestampMilliseconds);
  mockFunction(getTimeOriginMilliseconds).mockReturnValue(timeOriginMilliseconds - 64000);
  mockFunction(NATIVE.fetchNativeAppStart).mockResolvedValue(mockAppStartResponse);
  // Transaction start timestamp
  mockFunction(timestampInSeconds).mockReturnValue(timeOriginMilliseconds / 1000 + 65);

  return [timeOriginMilliseconds, appStartTimeMilliseconds, appStartDurationMilliseconds];
}

/**
 * Mocks RN Bundle Start Module
 * `var __BUNDLE_START_TIME__=this.nativePerformanceNow?nativePerformanceNow():Date.now()`
 */
function mockReactNativeBundleExecutionStartTimestamp() {
  RN_GLOBAL_OBJ.nativePerformanceNow = () => 100; // monotonic clock like `performance.now()`
  RN_GLOBAL_OBJ.__BUNDLE_START_TIME__ = 50; // 50ms after time origin

  const currentTimeMilliseconds = Date.now();
  dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => currentTimeMilliseconds);
}

/**
 * Removes mock added by mockReactNativeBundleExecutionStartTimestamp
 */
function clearReactNativeBundleExecutionStartTimestamp() {
  delete RN_GLOBAL_OBJ.nativePerformanceNow;
  delete RN_GLOBAL_OBJ.__BUNDLE_START_TIME__;

  if (dateNowSpy) {
    dateNowSpy.mockRestore();
  }
}

function set__DEV__(value: boolean) {
  Object.defineProperty(globalThis, '__DEV__', {
    value,
    writable: true,
  });
}
