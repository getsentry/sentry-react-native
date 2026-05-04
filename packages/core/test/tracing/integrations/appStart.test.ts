import type { ErrorEvent, Event, Integration, SpanJSON, TransactionEvent } from '@sentry/core';

import {
  debug,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SentryNonRecordingSpan,
  setCurrentClient,
  startInactiveSpan,
  timestampInSeconds,
} from '@sentry/core';

import type { NativeAppStartResponse } from '../../../src/js/NativeRNSentry';

import {
  APP_START_COLD as APP_START_COLD_MEASUREMENT,
  APP_START_WARM as APP_START_WARM_MEASUREMENT,
} from '../../../src/js/measurements';
import {
  APP_START_COLD as APP_START_COLD_OP,
  APP_START_WARM as APP_START_WARM_OP,
  UI_LOAD,
} from '../../../src/js/tracing';
import {
  _appLoaded,
  _captureAppStart,
  _clearAppStartEndData,
  _clearRootComponentCreationTimestampMs,
  _setAppStartEndData,
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
      fetchNativeFramesDelay: jest.fn(() => Promise.resolve(null)),
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

      const appStartRootSpan = actualEvent!.spans!.find(({ description }) => description === 'Cold Start');
      const bundleStartSpan = actualEvent!.spans!.find(
        ({ description }) => description === 'JS Bundle Execution Start',
      );

      expect(appStartRootSpan).toEqual(
        expect.objectContaining(<Partial<SpanJSON>>{
          span_id: expect.any(String),
          description: 'Cold Start',
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

      const appStartRootSpan = actualEvent!.spans!.find(({ description }) => description === 'Cold Start');
      const bundleStartSpan = actualEvent!.spans!.find(
        ({ description }) => description === 'JS Bundle Execution Before React Root',
      );

      expect(appStartRootSpan).toEqual(
        expect.objectContaining(<Partial<SpanJSON>>{
          span_id: expect.any(String),
          description: 'Cold Start',
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

      const appStartRootSpan = actualEvent!.spans!.find(({ description }) => description === 'Cold Start');
      const nativeSpan = actualEvent!.spans!.find(({ description }) => description === 'test native app start span');

      expect(appStartRootSpan).toEqual(
        expect.objectContaining(<Partial<SpanJSON>>{
          span_id: expect.any(String),
          description: 'Cold Start',
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
      expect(NATIVE.fetchNativeAppStart).toHaveBeenCalledTimes(1);
    });

    it('Does not add app start if native returns null', async () => {
      mockFunction(NATIVE.fetchNativeAppStart).mockResolvedValue(null);

      const actualEvent = await captureStandAloneAppStart();
      expect(actualEvent).toStrictEqual(undefined);
      expect(NATIVE.fetchNativeAppStart).toHaveBeenCalledTimes(1);
    });

    it('Attaches app start to standalone transaction even when navigation transaction starts first', async () => {
      // This test simulates the Android scenario where React Navigation auto-instrumentation
      // starts a navigation transaction before the standalone app start transaction is created.
      // The fix ensures that when standalone: true, the span ID check is skipped so app start
      // can be attached to the standalone transaction even if a navigation transaction started first.
      getCurrentScope().clear();
      getIsolationScope().clear();
      getGlobalScope().clear();

      mockAppStart({ cold: true });

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

      // Simulate a navigation transaction starting first (like React Navigation auto-instrumentation)
      // This will set firstStartedActiveRootSpanId to the navigation span's ID
      const navigationSpan = startInactiveSpan({
        name: 'calendar/home',
        op: 'navigation',
        forceTransaction: true,
      });
      const navigationSpanId = navigationSpan?.spanContext().spanId;
      if (navigationSpan) {
        navigationSpan.end();
      }

      // Now capture standalone app start - it should still work even though navigation span started first
      // The standalone transaction will have a different span ID, but the fix skips the check
      await integration.captureStandaloneAppStart();

      const actualEvent = client.event as TransactionEvent | undefined;
      expect(actualEvent).toBeDefined();
      expect(actualEvent?.spans).toBeDefined();
      expect(actualEvent?.spans?.length).toBeGreaterThan(0);

      // Verify that app start was attached successfully
      const appStartSpan = actualEvent!.spans!.find(({ description }) => description === 'Cold Start');
      expect(appStartSpan).toBeDefined();
      expect(appStartSpan).toEqual(
        expect.objectContaining<Partial<SpanJSON>>({
          description: 'Cold Start',
          op: APP_START_COLD_OP,
        }),
      );

      // Verify the standalone transaction has a different span ID than the navigation transaction
      // This confirms that the span ID check was skipped (otherwise app start wouldn't be attached)
      expect(actualEvent?.contexts?.trace?.span_id).toBeDefined();
      if (navigationSpanId) {
        expect(actualEvent?.contexts?.trace?.span_id).not.toBe(navigationSpanId);
      }

      expect(actualEvent?.measurements?.[APP_START_COLD_MEASUREMENT]).toBeDefined();
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

    it('Attaches app start to next transaction when first root span was dropped', async () => {
      mockAppStart({ cold: true });

      const integration = appStartIntegration();
      const client = new TestClient({
        ...getDefaultTestClientOptions(),
        enableAppStartTracking: true,
        tracesSampleRate: 1.0,
      });
      setCurrentClient(client);
      integration.setup(client);
      integration.afterAllSetup(client);

      // First root span starts — locks firstStartedActiveRootSpanId
      const firstSpan = startInactiveSpan({
        name: 'First Navigation',
        forceTransaction: true,
      });

      // Simulate the span being dropped (e.g., ignoreEmptyRouteChangeTransactions
      // marking the root span via the `sentry.rn.discard_reason` attribute during
      // spanEnd processing). The tracing integration's event processor drops the
      // resulting transaction; appStart detects the marker on the next spanStart
      // and resets the lock so the next root span can attach app start data.
      firstSpan.setAttribute('sentry.rn.discard_reason', 'no_route_info');

      // Second root span starts — recordFirstStartedActiveRootSpanId detects
      // the previously locked span is no longer sampled and resets the lock
      const secondSpan = startInactiveSpan({
        name: 'Second Navigation',
        forceTransaction: true,
      });
      const secondSpanId = secondSpan.spanContext().spanId;

      // Process a transaction event matching the second span
      const event = getMinimalTransactionEvent();
      event.contexts!.trace!.span_id = secondSpanId;

      const actualEvent = await processEventWithIntegration(integration, event);

      // App start should be attached to the second transaction
      const appStartSpan = (actualEvent as TransactionEvent)?.spans?.find(
        ({ description }) => description === 'Cold Start',
      );
      expect(appStartSpan).toBeDefined();
      expect(appStartSpan).toEqual(
        expect.objectContaining({
          description: 'Cold Start',
          op: APP_START_COLD_OP,
        }),
      );
      expect((actualEvent as TransactionEvent)?.measurements?.[APP_START_COLD_MEASUREMENT]).toBeDefined();
    });

    it('Skips app start attachment for discarded transactions and preserves it for the next one', async () => {
      mockAppStart({ cold: true });

      const integration = appStartIntegration();
      const client = new TestClient({
        ...getDefaultTestClientOptions(),
        enableAppStartTracking: true,
        tracesSampleRate: 1.0,
      });
      setCurrentClient(client);
      integration.setup(client);
      integration.afterAllSetup(client);

      // First root span — gets marked for discard before its transaction event
      // reaches the app start integration's processEvent.
      const firstSpan = startInactiveSpan({ name: 'First Navigation', forceTransaction: true });
      const firstSpanId = firstSpan.spanContext().spanId;
      firstSpan.setAttribute('sentry.rn.discard_reason', 'no_route_info');

      // Simulate `appStartIntegration` (registered before `reactNativeTracingIntegration`)
      // running its processEvent on the discarded transaction. It must not
      // attach app start data nor flip `appStartDataFlushed = true`, otherwise
      // the next real transaction would lose app start.
      const discardedEvent = getMinimalTransactionEvent();
      discardedEvent.contexts!.trace!.span_id = firstSpanId;
      discardedEvent.contexts!.trace!.data = { 'sentry.rn.discard_reason': 'no_route_info' };

      const processedDiscarded = await processEventWithIntegration(integration, discardedEvent);

      // Event passes through unchanged — no app start span attached.
      const discardedColdStartSpan = (processedDiscarded as TransactionEvent)?.spans?.find(
        ({ description }) => description === 'Cold Start',
      );
      expect(discardedColdStartSpan).toBeUndefined();
      expect((processedDiscarded as TransactionEvent)?.measurements?.[APP_START_COLD_MEASUREMENT]).toBeUndefined();

      // Next real root span starts — its discard marker on the previous span
      // resets the lock and the new span gets locked.
      const secondSpan = startInactiveSpan({ name: 'Second Navigation', forceTransaction: true });
      const secondSpanId = secondSpan.spanContext().spanId;

      const realEvent = getMinimalTransactionEvent();
      realEvent.contexts!.trace!.span_id = secondSpanId;

      const actualEvent = await processEventWithIntegration(integration, realEvent);

      // App start data is still available because the discarded event did not
      // flip `appStartDataFlushed`.
      const appStartSpan = (actualEvent as TransactionEvent)?.spans?.find(
        ({ description }) => description === 'Cold Start',
      );
      expect(appStartSpan).toBeDefined();
      expect((actualEvent as TransactionEvent)?.measurements?.[APP_START_COLD_MEASUREMENT]).toBeDefined();
    });

    it('Does not lock firstStartedActiveRootSpanId to unsampled root span', async () => {
      mockAppStart({ cold: true });

      const integration = appStartIntegration();
      const client = new TestClient({
        ...getDefaultTestClientOptions(),
        enableAppStartTracking: true,
        tracesSampleRate: 1.0,
      });
      setCurrentClient(client);
      integration.setup(client);
      integration.afterAllSetup(client);

      // Simulate an unsampled root span starting first
      const unsampledSpan = new SentryNonRecordingSpan();
      client.emit('spanStart', unsampledSpan);

      // Then a sampled root span starts
      const sampledSpan = startInactiveSpan({
        name: 'Sampled Root Span',
        forceTransaction: true,
      });
      const sampledSpanId = sampledSpan.spanContext().spanId;

      // Process a transaction event matching the sampled span
      const event = getMinimalTransactionEvent();
      event.contexts!.trace!.span_id = sampledSpanId;

      const actualEvent = await processEventWithIntegration(integration, event);

      // App start should be attached to the sampled transaction
      const appStartSpan = (actualEvent as TransactionEvent)?.spans?.find(
        ({ description }) => description === 'Cold Start',
      );
      expect(appStartSpan).toBeDefined();
      expect(appStartSpan).toEqual(
        expect.objectContaining({
          description: 'Cold Start',
          op: APP_START_COLD_OP,
        }),
      );
      expect((actualEvent as TransactionEvent)?.measurements?.[APP_START_COLD_MEASUREMENT]).toBeDefined();
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

      const appStartRootSpan = actualEvent!.spans!.find(({ description }) => description === 'Cold Start');
      const bundleStartSpan = actualEvent!.spans!.find(
        ({ description }) => description === 'JS Bundle Execution Start',
      );

      expect(appStartRootSpan).toEqual(
        expect.objectContaining(<Partial<SpanJSON>>{
          description: 'Cold Start',
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

      const appStartRootSpan = actualEvent!.spans!.find(({ description }) => description === 'Cold Start');
      const bundleStartSpan = actualEvent!.spans!.find(
        ({ description }) => description === 'JS Bundle Execution Before React Root',
      );

      expect(appStartRootSpan).toEqual(
        expect.objectContaining(<Partial<SpanJSON>>{
          description: 'Cold Start',
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

      const appStartRootSpan = actualEvent!.spans!.find(({ description }) => description === 'Cold Start');
      const bundleStartSpan = actualEvent!.spans!.find(
        ({ description }) => description === 'JS Bundle Execution Before React Root',
      );

      expect(appStartRootSpan).toEqual(
        expect.objectContaining(<Partial<SpanJSON>>{
          description: 'Cold Start',
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

      const appStartRootSpan = actualEvent!.spans!.find(({ description }) => description === 'Cold Start');
      const nativeSpan = actualEvent!.spans!.find(({ description }) => description === 'test native app start span');

      expect(appStartRootSpan).toEqual(
        expect.objectContaining(<Partial<SpanJSON>>{
          description: 'Cold Start',
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
      expect(NATIVE.fetchNativeAppStart).toHaveBeenCalledTimes(1);
    });

    it('Does not add app start if native returns null', async () => {
      mockFunction(NATIVE.fetchNativeAppStart).mockResolvedValue(null);

      const actualEvent = await processEvent(getMinimalTransactionEvent());
      expect(actualEvent).toStrictEqual(getMinimalTransactionEvent());
      expect(NATIVE.fetchNativeAppStart).toHaveBeenCalledTimes(1);
    });

    it('Sets appStartDataFlushed when native returns null to prevent wasteful retries', async () => {
      mockFunction(NATIVE.fetchNativeAppStart).mockResolvedValue(null);

      const integration = appStartIntegration();
      const client = new TestClient(getDefaultTestClientOptions());

      const firstEvent = getMinimalTransactionEvent();
      (integration as AppStartIntegrationTest).setFirstStartedActiveRootSpanId(firstEvent.contexts?.trace?.span_id);

      await integration.processEvent(firstEvent, {}, client);
      expect(firstEvent.measurements).toBeUndefined();

      // Second transaction should be skipped (appStartDataFlushed = true)
      mockAppStart({ cold: true });
      const secondEvent = getMinimalTransactionEvent();
      secondEvent.contexts!.trace!.span_id = '456';
      (integration as AppStartIntegrationTest).setFirstStartedActiveRootSpanId(secondEvent.contexts?.trace?.span_id);

      const actualSecondEvent = await integration.processEvent(secondEvent, {}, client);
      expect((actualSecondEvent as TransactionEvent).measurements).toBeUndefined();
      // fetchNativeAppStart should only be called once — the second event was skipped
      expect(NATIVE.fetchNativeAppStart).toHaveBeenCalledTimes(1);
    });

    it('Sets appStartDataFlushed when has_fetched is true to prevent wasteful retries', async () => {
      mockFunction(NATIVE.fetchNativeAppStart).mockResolvedValue({
        type: 'cold',
        has_fetched: true,
        spans: [],
      });

      const integration = appStartIntegration();
      const client = new TestClient(getDefaultTestClientOptions());

      const firstEvent = getMinimalTransactionEvent();
      (integration as AppStartIntegrationTest).setFirstStartedActiveRootSpanId(firstEvent.contexts?.trace?.span_id);

      await integration.processEvent(firstEvent, {}, client);

      // Second transaction should be skipped (appStartDataFlushed = true)
      mockAppStart({ cold: true });
      const secondEvent = getMinimalTransactionEvent();
      secondEvent.contexts!.trace!.span_id = '456';
      (integration as AppStartIntegrationTest).setFirstStartedActiveRootSpanId(secondEvent.contexts?.trace?.span_id);

      const actualSecondEvent = await integration.processEvent(secondEvent, {}, client);
      expect((actualSecondEvent as TransactionEvent).measurements).toBeUndefined();
    });

    it('Sets appStartDataFlushed when app start end timestamp is before app start timestamp', async () => {
      mockAppStart({ cold: true, appStartEndTimestampMs: Date.now() - 1000 });

      const integration = appStartIntegration();
      const client = new TestClient(getDefaultTestClientOptions());

      const firstEvent = getMinimalTransactionEvent();
      (integration as AppStartIntegrationTest).setFirstStartedActiveRootSpanId(firstEvent.contexts?.trace?.span_id);

      await integration.processEvent(firstEvent, {}, client);
      expect(firstEvent.measurements).toBeUndefined();

      // Second transaction should be skipped (appStartDataFlushed = true)
      mockAppStart({ cold: true });
      const secondEvent = getMinimalTransactionEvent();
      secondEvent.contexts!.trace!.span_id = '456';
      (integration as AppStartIntegrationTest).setFirstStartedActiveRootSpanId(secondEvent.contexts?.trace?.span_id);

      const actualSecondEvent = await integration.processEvent(secondEvent, {}, client);
      expect((actualSecondEvent as TransactionEvent).measurements).toBeUndefined();
    });
  });
});

describe('appLoaded() API', () => {
  let client: TestClient;

  beforeEach(() => {
    jest.clearAllMocks();
    _clearAppStartEndData();
    _clearRootComponentCreationTimestampMs();
    mockReactNativeBundleExecutionStartTimestamp();
    client = new TestClient({
      ...getDefaultTestClientOptions(),
      enableAppStartTracking: true,
      tracesSampleRate: 1.0,
    });
    setCurrentClient(client);
    client.init();
  });

  afterEach(() => {
    clearReactNativeBundleExecutionStartTimestamp();
    _clearAppStartEndData();
    _clearRootComponentCreationTimestampMs();
  });

  function makeIntegration(): AppStartIntegrationTest {
    const integration = appStartIntegration({ standalone: false }) as AppStartIntegrationTest;
    integration.setup(client);
    integration.afterAllSetup(client);
    return integration;
  }

  it('sets the app start end timestamp and marks it as manual', async () => {
    const appLoadedTimeSeconds = Date.now() / 1000;
    mockFunction(timestampInSeconds).mockReturnValue(appLoadedTimeSeconds);

    await _appLoaded();

    const appStartTimeMilliseconds = appLoadedTimeSeconds * 1000 - 3000;
    mockFunction(NATIVE.fetchNativeAppStart).mockResolvedValue({
      type: 'cold' as const,
      app_start_timestamp_ms: appStartTimeMilliseconds,
      has_fetched: false,
      spans: [],
    });

    const integration = makeIntegration();
    integration.setFirstStartedActiveRootSpanId('test-span-id');

    const event: TransactionEvent = {
      type: 'transaction',
      start_timestamp: Date.now() / 1000,
      timestamp: Date.now() / 1000 + 1,
      contexts: { trace: { span_id: 'test-span-id', trace_id: 'trace123' } },
    };

    const processed = (await integration.processEvent(event, {}, client)) as TransactionEvent;
    const appStartSpan = processed.spans?.find(s => s.op === APP_START_COLD_OP);

    expect(appStartSpan).toBeDefined();
    expect(appStartSpan?.timestamp).toBeCloseTo(appLoadedTimeSeconds, 1);
    expect(appStartSpan?.origin).toBe(SPAN_ORIGIN_MANUAL_APP_START);
  });

  it('ignores subsequent calls after first invocation', async () => {
    const warnSpy = jest.spyOn(debug, 'warn');

    await _appLoaded();
    await _appLoaded();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('already called'));
  });

  it('overrides auto-detected timestamp when called after _captureAppStart', async () => {
    const now = Date.now();
    const autoTimeSeconds = now / 1000;
    const manualTimeSeconds = now / 1000 + 0.5;
    const appStartTimeMilliseconds = now - 3000;

    mockFunction(timestampInSeconds).mockReturnValueOnce(autoTimeSeconds);
    await _captureAppStart({ isManual: false });

    mockFunction(timestampInSeconds).mockReturnValueOnce(manualTimeSeconds);
    await _appLoaded();

    mockFunction(NATIVE.fetchNativeAppStart).mockResolvedValue({
      type: 'cold' as const,
      app_start_timestamp_ms: appStartTimeMilliseconds,
      has_fetched: false,
      spans: [],
    });

    const integration = makeIntegration();
    integration.setFirstStartedActiveRootSpanId('span-override');

    const event: TransactionEvent = {
      type: 'transaction',
      start_timestamp: now / 1000,
      timestamp: now / 1000 + 2,
      contexts: { trace: { span_id: 'span-override', trace_id: 'trace' } },
    };

    const processed = (await integration.processEvent(event, {}, client)) as TransactionEvent;
    const appStartSpan = processed.spans?.find(s => s.op === APP_START_COLD_OP);
    expect(appStartSpan?.timestamp).toBeCloseTo(manualTimeSeconds, 1);
  });

  it('prevents auto-capture from overriding when called before _captureAppStart', async () => {
    await _appLoaded();

    const logSpy = jest.spyOn(debug, 'log');
    await _captureAppStart({ isManual: false });

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping auto app start capture'));
  });

  it('warns and is a no-op when called before Sentry.init', async () => {
    const warnSpy = jest.spyOn(debug, 'warn');
    getCurrentScope().setClient(undefined);
    getGlobalScope().setClient(undefined);
    getIsolationScope().setClient(undefined);

    await _appLoaded();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('before Sentry.init'));

    setCurrentClient(client);
  });

  it('does not block auto-capture when called before Sentry.init', async () => {
    // Simulate appLoaded() called before init — should NOT set the flag
    getCurrentScope().setClient(undefined);
    getGlobalScope().setClient(undefined);
    getIsolationScope().setClient(undefined);

    await _appLoaded();

    setCurrentClient(client);

    // Auto-capture should still work because the flag was not set
    const autoTimeSeconds = Date.now() / 1000;
    mockFunction(timestampInSeconds).mockReturnValueOnce(autoTimeSeconds);
    await _captureAppStart({ isManual: false });

    const appStartTimeMilliseconds = autoTimeSeconds * 1000 - 3000;
    mockFunction(NATIVE.fetchNativeAppStart).mockResolvedValue({
      type: 'cold' as const,
      app_start_timestamp_ms: appStartTimeMilliseconds,
      has_fetched: false,
      spans: [],
    });

    const integration = makeIntegration();
    integration.setFirstStartedActiveRootSpanId('span-after-init');

    const event: TransactionEvent = {
      type: 'transaction',
      start_timestamp: autoTimeSeconds,
      timestamp: autoTimeSeconds + 2,
      contexts: { trace: { span_id: 'span-after-init', trace_id: 'trace' } },
    };

    const processed = (await integration.processEvent(event, {}, client)) as TransactionEvent;
    const appStartSpan = processed.spans?.find(s => s.op === APP_START_COLD_OP);
    expect(appStartSpan).toBeDefined();
    expect(appStartSpan?.timestamp).toBeCloseTo(autoTimeSeconds, 1);
  });
});

describe('appLoaded() standalone mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _clearAppStartEndData();
    _clearRootComponentCreationTimestampMs();
    mockReactNativeBundleExecutionStartTimestamp();
  });

  afterEach(() => {
    clearReactNativeBundleExecutionStartTimestamp();
    _clearAppStartEndData();
    _clearRootComponentCreationTimestampMs();
  });

  it('triggers standalone app start capture via appLoaded()', async () => {
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();

    const [, appStartTimeMilliseconds] = mockAppStart({ cold: true });

    const integration = appStartIntegration({ standalone: true }) as AppStartIntegrationTest;
    const standaloneClient = new TestClient({
      ...getDefaultTestClientOptions(),
      enableAppStartTracking: true,
      tracesSampleRate: 1.0,
    });
    setCurrentClient(standaloneClient);
    integration.setup(standaloneClient);
    standaloneClient.addIntegration(integration);

    const appLoadedTimeSeconds = Date.now() / 1000 + 0.5;
    mockFunction(timestampInSeconds).mockReturnValue(appLoadedTimeSeconds);

    await _appLoaded();
    // Flush async event processing triggered by scope.captureEvent
    await new Promise(resolve => setTimeout(resolve, 0));

    const actualEvent = standaloneClient.event;
    expect(actualEvent).toBeDefined();

    const appStartSpan = actualEvent?.spans?.find(s => s.op === APP_START_COLD_OP);
    expect(appStartSpan).toBeDefined();
    expect(appStartSpan?.timestamp).toBeCloseTo(appLoadedTimeSeconds, 1);
    expect(appStartSpan?.start_timestamp).toBeCloseTo(appStartTimeMilliseconds / 1000, 1);
    expect(appStartSpan?.origin).toBe(SPAN_ORIGIN_MANUAL_APP_START);
  });

  it('overrides already-flushed standalone transaction when appLoaded() is called after auto-capture', async () => {
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();

    const [, appStartTimeMilliseconds] = mockAppStart({ cold: true });

    const integration = appStartIntegration({ standalone: true }) as AppStartIntegrationTest;
    const standaloneClient = new TestClient({
      ...getDefaultTestClientOptions(),
      enableAppStartTracking: true,
      tracesSampleRate: 1.0,
    });
    setCurrentClient(standaloneClient);
    integration.setup(standaloneClient);
    standaloneClient.addIntegration(integration);

    // Simulate auto-capture from ReactNativeProfiler (componentDidMount).
    // In standalone mode, auto-capture defers the send to give appLoaded() a chance.
    const autoTimeSeconds = Date.now() / 1000;
    mockFunction(timestampInSeconds).mockReturnValue(autoTimeSeconds);
    await _captureAppStart({ isManual: false });

    // No transaction sent yet — the standalone send is deferred
    expect(standaloneClient.eventQueue.length).toBe(0);

    // Now call appLoaded() with a later timestamp — this cancels the deferred
    // auto-capture send and sends only one transaction with the manual timestamp.
    const manualTimeSeconds = autoTimeSeconds + 2;
    mockFunction(timestampInSeconds).mockReturnValue(manualTimeSeconds);
    await _appLoaded();
    await new Promise(resolve => setTimeout(resolve, 0));

    // Only one transaction should be sent — the manual one
    expect(standaloneClient.eventQueue.length).toBe(1);
    const manualEvent = standaloneClient.eventQueue[0];
    const manualSpan = manualEvent?.spans?.find(s => s.op === APP_START_COLD_OP);
    expect(manualSpan).toBeDefined();
    expect(manualSpan?.timestamp).toBeCloseTo(manualTimeSeconds, 1);
    expect(manualSpan?.start_timestamp).toBeCloseTo(appStartTimeMilliseconds / 1000, 1);
    expect(manualSpan?.origin).toBe(SPAN_ORIGIN_MANUAL_APP_START);
  });

  it('sends deferred standalone transaction when appLoaded() is not called', async () => {
    jest.useFakeTimers();

    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();

    const [, appStartTimeMilliseconds] = mockAppStart({ cold: true });

    const integration = appStartIntegration({ standalone: true }) as AppStartIntegrationTest;
    const standaloneClient = new TestClient({
      ...getDefaultTestClientOptions(),
      enableAppStartTracking: true,
      tracesSampleRate: 1.0,
    });
    setCurrentClient(standaloneClient);
    integration.setup(standaloneClient);
    standaloneClient.addIntegration(integration);

    const autoTimeSeconds = Date.now() / 1000;
    mockFunction(timestampInSeconds).mockReturnValue(autoTimeSeconds);
    await _captureAppStart({ isManual: false });

    // No transaction yet — deferred
    expect(standaloneClient.eventQueue.length).toBe(0);

    // Advance timers to fire the deferred send, then switch to real timers
    // so the async captureStandaloneAppStart() can complete naturally.
    jest.runAllTimers();
    jest.useRealTimers();
    // Flush async event processing (captureStandaloneAppStart has multiple await steps)
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(standaloneClient.eventQueue.length).toBe(1);
    const autoEvent = standaloneClient.eventQueue[0];
    const autoSpan = autoEvent?.spans?.find(s => s.op === APP_START_COLD_OP);
    expect(autoSpan).toBeDefined();
    expect(autoSpan?.timestamp).toBeCloseTo(autoTimeSeconds, 1);
    expect(autoSpan?.start_timestamp).toBeCloseTo(appStartTimeMilliseconds / 1000, 1);
  });

  it('allows auto-capture again after isAppLoadedManuallyInvoked is reset', async () => {
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();

    mockAppStart({ cold: true });

    const integration = appStartIntegration({ standalone: true }) as AppStartIntegrationTest;
    const standaloneClient = new TestClient({
      ...getDefaultTestClientOptions(),
      enableAppStartTracking: true,
      tracesSampleRate: 1.0,
    });
    setCurrentClient(standaloneClient);
    integration.setup(standaloneClient);
    standaloneClient.addIntegration(integration);

    // First app start: call appLoaded()
    const firstTimeSeconds = Date.now() / 1000;
    mockFunction(timestampInSeconds).mockReturnValue(firstTimeSeconds);
    await _appLoaded();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(standaloneClient.eventQueue.length).toBe(1);

    // Verify auto-capture is blocked while flag is set
    const logSpy = jest.spyOn(debug, 'log');
    await _captureAppStart({ isManual: false });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping auto app start capture'));

    // Simulate what onRunApplication does: reset flags for a new app start
    _clearAppStartEndData();
    mockAppStart({ cold: true });

    // Now auto-capture should work again
    logSpy.mockClear();
    const autoTimeSeconds = Date.now() / 1000 + 1;
    mockFunction(timestampInSeconds).mockReturnValue(autoTimeSeconds);
    await _captureAppStart({ isManual: false });

    const skippedCalls = logSpy.mock.calls.filter(
      call => typeof call[0] === 'string' && call[0].includes('Skipping auto app start capture'),
    );
    expect(skippedCalls.length).toBe(0);
  });
});

describe('Frame Data Integration', () => {
  it('attaches frame data to standalone cold app start span', async () => {
    const mockEndFrames = {
      totalFrames: 150,
      slowFrames: 5,
      frozenFrames: 2,
    };

    mockFunction(NATIVE.fetchNativeFrames).mockResolvedValue(mockEndFrames);

    mockAppStart({ cold: true });

    const actualEvent = await captureStandAloneAppStart();

    const appStartSpan = actualEvent!.spans!.find(({ description }) => description === 'Cold Start');

    expect(appStartSpan).toBeDefined();
    expect(appStartSpan!.data).toEqual(
      expect.objectContaining({
        'frames.total': 150,
        'frames.slow': 5,
        'frames.frozen': 2,
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: APP_START_COLD_OP,
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_APP_START,
      }),
    );
  });

  it('attaches frame data to standalone warm app start span', async () => {
    const mockEndFrames = {
      totalFrames: 200,
      slowFrames: 8,
      frozenFrames: 1,
    };

    mockFunction(NATIVE.fetchNativeFrames).mockResolvedValue(mockEndFrames);

    mockAppStart({ cold: false });

    const actualEvent = await captureStandAloneAppStart();

    const appStartSpan = actualEvent!.spans!.find(({ description }) => description === 'Warm Start');

    expect(appStartSpan).toBeDefined();
    expect(appStartSpan!.data).toEqual(
      expect.objectContaining({
        'frames.total': 200,
        'frames.slow': 8,
        'frames.frozen': 1,
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: APP_START_WARM_OP,
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_APP_START,
      }),
    );
  });

  it('attaches frame data to attached cold app start span', async () => {
    const mockEndFrames = {
      totalFrames: 120,
      slowFrames: 3,
      frozenFrames: 0,
    };

    mockFunction(NATIVE.fetchNativeFrames).mockResolvedValue(mockEndFrames);

    mockAppStart({ cold: true });

    await _captureAppStart({ isManual: false });

    const actualEvent = await processEvent(getMinimalTransactionEvent());

    const appStartSpan = actualEvent!.spans!.find(({ description }) => description === 'Cold Start');

    expect(appStartSpan).toBeDefined();
    expect(appStartSpan!.data).toEqual(
      expect.objectContaining({
        'frames.total': 120,
        'frames.slow': 3,
        'frames.frozen': 0,
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: APP_START_COLD_OP,
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_APP_START,
      }),
    );
  });

  it('attaches frame data to attached warm app start span', async () => {
    const mockEndFrames = {
      totalFrames: 180,
      slowFrames: 12,
      frozenFrames: 3,
    };

    mockFunction(NATIVE.fetchNativeFrames).mockResolvedValue(mockEndFrames);

    mockAppStart({ cold: false });

    await _captureAppStart({ isManual: false });

    const actualEvent = await processEvent(getMinimalTransactionEvent());

    const appStartSpan = actualEvent!.spans!.find(({ description }) => description === 'Warm Start');

    expect(appStartSpan).toBeDefined();
    expect(appStartSpan!.data).toEqual(
      expect.objectContaining({
        'frames.total': 180,
        'frames.slow': 12,
        'frames.frozen': 3,
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: APP_START_WARM_OP,
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_APP_START,
      }),
    );
  });

  it('does not attach frame data when they are no frames', async () => {
    const mockEndFrames = {
      totalFrames: 0,
      slowFrames: 0,
      frozenFrames: 0,
    };

    mockFunction(NATIVE.fetchNativeFrames).mockResolvedValue(mockEndFrames);

    mockAppStart({ cold: true });

    await _captureAppStart({ isManual: false });

    const actualEvent = await processEvent(getMinimalTransactionEvent());

    const appStartSpan = actualEvent!.spans!.find(({ description }) => description === 'Cold Start');

    expect(appStartSpan).toBeDefined();
    expect(appStartSpan!.data).toEqual(
      expect.objectContaining({
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: APP_START_COLD_OP,
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_APP_START,
      }),
    );

    expect(appStartSpan!.data).not.toHaveProperty('frames.total');
    expect(appStartSpan!.data).not.toHaveProperty('frames.slow');
    expect(appStartSpan!.data).not.toHaveProperty('frames.frozen');
  });

  it('does not attach frame data when native frames are not available', async () => {
    mockFunction(NATIVE.fetchNativeFrames).mockRejectedValue(new Error('Native frames not available'));

    mockAppStart({ cold: true });

    const actualEvent = await captureStandAloneAppStart();

    const appStartSpan = actualEvent!.spans!.find(({ description }) => description === 'Cold Start');

    expect(appStartSpan).toBeDefined();
    expect(appStartSpan!.data).toEqual(
      expect.objectContaining({
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: APP_START_COLD_OP,
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_APP_START,
      }),
    );

    expect(appStartSpan!.data).not.toHaveProperty('frames.total');
    expect(appStartSpan!.data).not.toHaveProperty('frames.slow');
    expect(appStartSpan!.data).not.toHaveProperty('frames.frozen');
  });

  it('does not attach frame data when NATIVE is not enabled', async () => {
    const originalEnableNative = NATIVE.enableNative;
    (NATIVE as any).enableNative = false;

    try {
      mockAppStart({ cold: true });

      const actualEvent = await captureStandAloneAppStart();

      const appStartSpan = actualEvent!.spans!.find(({ description }) => description === 'Cold Start');

      expect(appStartSpan).toBeDefined();
      expect(appStartSpan!.data).toEqual(
        expect.objectContaining({
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: APP_START_COLD_OP,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN_AUTO_APP_START,
        }),
      );

      expect(appStartSpan!.data).not.toHaveProperty('frames.total');
      expect(appStartSpan!.data).not.toHaveProperty('frames.slow');
      expect(appStartSpan!.data).not.toHaveProperty('frames.frozen');
    } finally {
      (NATIVE as any).enableNative = originalEnableNative;
    }
  });

  it('attaches frames.delay to app start span', async () => {
    const mockEndFrames = {
      totalFrames: 150,
      slowFrames: 5,
      frozenFrames: 2,
    };

    mockFunction(NATIVE.fetchNativeFrames).mockResolvedValue(mockEndFrames);
    mockFunction(NATIVE.fetchNativeFramesDelay).mockResolvedValue(0.25);

    mockAppStart({ cold: true });

    const actualEvent = await captureStandAloneAppStart();

    const appStartSpan = actualEvent!.spans!.find(({ description }) => description === 'Cold Start');

    expect(appStartSpan).toBeDefined();
    expect(appStartSpan!.data).toEqual(
      expect.objectContaining({
        'frames.delay': 0.25,
      }),
    );
  });

  it('does not attach frames.delay when native returns null', async () => {
    const mockEndFrames = {
      totalFrames: 150,
      slowFrames: 5,
      frozenFrames: 2,
    };

    mockFunction(NATIVE.fetchNativeFrames).mockResolvedValue(mockEndFrames);
    mockFunction(NATIVE.fetchNativeFramesDelay).mockResolvedValue(null);

    mockAppStart({ cold: true });

    const actualEvent = await captureStandAloneAppStart();

    const appStartSpan = actualEvent!.spans!.find(({ description }) => description === 'Cold Start');

    expect(appStartSpan).toBeDefined();
    expect(appStartSpan!.data).not.toHaveProperty('frames.delay');
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
        data: {},
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
        description: 'Cold Start',
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
        data: {},
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
        description: 'Warm Start',
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
        data: {},
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
        description: 'Cold Start',
        start_timestamp: appStartTimeMilliseconds / 1000,
        timestamp: expect.any(Number),
        trace_id: expect.any(String),
        span_id: expect.any(String),
        parent_span_id: actualEvent.contexts.trace.span_id,
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
        description: 'Warm Start',
        start_timestamp: appStartTimeMilliseconds / 1000,
        timestamp: expect.any(Number),
        trace_id: expect.any(String),
        span_id: expect.any(String),
        parent_span_id: actualEvent.contexts.trace.span_id,
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

  _setAppStartEndData({
    timestampMs: appStartEndTimestampMs || timeOriginMilliseconds,
    endFrames: null,
  });
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

  _setAppStartEndData({
    timestampMs: timeOriginMilliseconds,
    endFrames: null,
  });
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
  _setAppStartEndData({
    timestampMs: appStartEndTimestampMilliseconds,
    endFrames: null,
  });
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
