/* eslint-disable complexity, max-lines */
import type { Client, Event, Integration, Span, SpanJSON, TransactionEvent } from '@sentry/core';
import {
  debug,
  getCapturedScopesOnSpan,
  getClient,
  getCurrentScope,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SentryNonRecordingSpan,
  startInactiveSpan,
  timestampInSeconds,
} from '@sentry/core';
import { getAppRegistryIntegration } from '../../integrations/appRegistry';
import {
  APP_START_COLD as APP_START_COLD_MEASUREMENT,
  APP_START_WARM as APP_START_WARM_MEASUREMENT,
} from '../../measurements';
import type { NativeAppStartResponse, NativeFramesResponse } from '../../NativeRNSentry';
import type { ReactNativeClientOptions } from '../../options';
import { convertSpanToTransaction, isRootSpan, setEndTimeValue } from '../../utils/span';
import { NATIVE } from '../../wrapper';
import {
  APP_START_COLD as APP_START_COLD_OP,
  APP_START_WARM as APP_START_WARM_OP,
  UI_LOAD as UI_LOAD_OP,
} from '../ops';
import { SPAN_ORIGIN_AUTO_APP_START, SPAN_ORIGIN_MANUAL_APP_START } from '../origin';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP } from '../semanticAttributes';
import { setMainThreadInfo } from '../span';
import { createChildSpanJSON, createSpanJSON, getBundleStartTimestampMs } from '../utils';

const INTEGRATION_NAME = 'AppStart';

export type AppStartIntegration = Integration & {
  captureStandaloneAppStart: () => Promise<void>;
};

/**
 * We filter out app start more than 60s.
 * This could be due to many different reasons.
 * We've seen app starts with hours, days and even months.
 */
const MAX_APP_START_DURATION_MS = 60_000;

/** We filter out App starts which timestamp is 60s and more before the transaction start */
const MAX_APP_START_AGE_MS = 60_000;

/** App Start transaction name */
const APP_START_TX_NAME = 'App Start';

interface AppStartEndData {
  timestampMs: number;
  endFrames: NativeFramesResponse | null;
}

let appStartEndData: AppStartEndData | undefined = undefined;
let isRecordedAppStartEndTimestampMsManual = false;

let rootComponentCreationTimestampMs: number | undefined = undefined;
let isRootComponentCreationTimestampMsManual = false;

/**
 * Records the application start end.
 * Used automatically by `Sentry.wrap` and `Sentry.ReactNativeProfiler`.
 */
export function captureAppStart(): Promise<void> {
  return _captureAppStart({ isManual: true });
}

/**
 * For internal use only.
 *
 * @private
 */
export async function _captureAppStart({ isManual }: { isManual: boolean }): Promise<void> {
  const client = getClient();
  if (!client) {
    debug.warn('[AppStart] Could not capture App Start, missing client.');
    return;
  }

  isRecordedAppStartEndTimestampMsManual = isManual;

  const timestampMs = timestampInSeconds() * 1000;
  let endFrames: NativeFramesResponse | null = null;

  if (NATIVE.enableNative) {
    try {
      endFrames = await NATIVE.fetchNativeFrames();
      debug.log('[AppStart] Captured end frames for app start.', endFrames);
    } catch (error) {
      debug.log('[AppStart] Failed to capture end frames for app start.', error);
    }
  }

  _setAppStartEndData({
    timestampMs,
    endFrames,
  });

  await client.getIntegrationByName<AppStartIntegration>(INTEGRATION_NAME)?.captureStandaloneAppStart();
}

/**
 * Sets the root component first constructor call timestamp.
 * Used automatically by `Sentry.wrap` and `Sentry.ReactNativeProfiler`.
 */
export function setRootComponentCreationTimestampMs(timestampMs: number): void {
  appStartEndData?.timestampMs && debug.warn('Setting Root component creation timestamp after app start end is set.');
  rootComponentCreationTimestampMs && debug.warn('Overwriting already set root component creation timestamp.');
  rootComponentCreationTimestampMs = timestampMs;
  isRootComponentCreationTimestampMsManual = true;
}

/**
 * For internal use only.
 *
 * @private
 */
export function _setRootComponentCreationTimestampMs(timestampMs: number): void {
  setRootComponentCreationTimestampMs(timestampMs);
  isRootComponentCreationTimestampMsManual = false;
}

/**
 * For internal use only.
 *
 * @private
 */
export const _setAppStartEndData = (data: AppStartEndData): void => {
  appStartEndData && debug.warn('Overwriting already set app start end data.');
  appStartEndData = data;
};

/**
 * For testing purposes only.
 *
 * @private
 */
export function _clearRootComponentCreationTimestampMs(): void {
  rootComponentCreationTimestampMs = undefined;
}

/**
 * Attaches frame data to a span's data object.
 */
function attachFrameDataToSpan(span: SpanJSON, frames: NativeFramesResponse): void {
  if (frames.totalFrames <= 0 && frames.slowFrames <= 0 && frames.totalFrames <= 0) {
    debug.warn(`[AppStart] Detected zero slow or frozen frames. Not adding measurements to spanId (${span.span_id}).`);
    return;
  }
  span.data = span.data || {};
  span.data['frames.total'] = frames.totalFrames;
  span.data['frames.slow'] = frames.slowFrames;
  span.data['frames.frozen'] = frames.frozenFrames;

  debug.log('[AppStart] Attached frame data to span.', {
    spanId: span.span_id,
    frameData: {
      total: frames.totalFrames,
      slow: frames.slowFrames,
      frozen: frames.frozenFrames,
    },
  });
}

/**
 * Adds AppStart spans from the native layer to the transaction event.
 */
export const appStartIntegration = ({
  standalone = false,
}: {
  /**
   * Should the integration send App Start as a standalone root span (transaction)?
   * If false, App Start will be added as a child span to the first transaction.
   *
   * @default false
   */
  standalone?: boolean;
} = {}): AppStartIntegration => {
  let _client: Client | undefined = undefined;
  let isEnabled = true;
  let appStartDataFlushed = false;
  let afterAllSetupCalled = false;
  let firstStartedActiveRootSpanId: string | undefined = undefined;

  const setup = (client: Client): void => {
    _client = client;
    const { enableAppStartTracking } = client.getOptions() as ReactNativeClientOptions;

    if (!enableAppStartTracking) {
      isEnabled = false;
      debug.warn('[AppStart] App start tracking is disabled.');
    }

    client.on('spanStart', recordFirstStartedActiveRootSpanId);
  };

  const afterAllSetup = (client: Client): void => {
    if (afterAllSetupCalled) {
      return;
    }
    afterAllSetupCalled = true;

    // TODO: automatically set standalone based on the presence of the native layer navigation integration

    getAppRegistryIntegration(client)?.onRunApplication(() => {
      if (appStartDataFlushed) {
        debug.log('[AppStartIntegration] Resetting app start data flushed flag based on runApplication call.');
        appStartDataFlushed = false;
        firstStartedActiveRootSpanId = undefined;
      } else {
        debug.log(
          '[AppStartIntegration] Waiting for initial app start was flush, before updating based on runApplication call.',
        );
      }
    });
  };

  const processEvent = async (event: Event): Promise<Event> => {
    if (!isEnabled || standalone) {
      return event;
    }

    if (event.type !== 'transaction') {
      // App start data is only relevant for transactions
      return event;
    }

    await attachAppStartToTransactionEvent(event as TransactionEvent);

    return event;
  };

  const recordFirstStartedActiveRootSpanId = (rootSpan: Span): void => {
    if (firstStartedActiveRootSpanId) {
      return;
    }

    if (!isRootSpan(rootSpan)) {
      return;
    }

    setFirstStartedActiveRootSpanId(rootSpan.spanContext().spanId);
  };

  /**
   * For testing purposes only.
   * @private
   */
  const setFirstStartedActiveRootSpanId = (spanId: string | undefined): void => {
    firstStartedActiveRootSpanId = spanId;
    debug.log('[AppStart] First started active root span id recorded.', firstStartedActiveRootSpanId);
  };

  async function captureStandaloneAppStart(): Promise<void> {
    if (!_client) {
      // If client is not set, SDK was not initialized, logger is thus disabled
      // eslint-disable-next-line no-console
      console.warn('[AppStart] Could not capture App Start, missing client, call `Sentry.init` first.');
      return;
    }

    if (!standalone) {
      debug.log(
        '[AppStart] App start tracking is enabled. App start will be added to the first transaction as a child span.',
      );
      return;
    }

    debug.log('[AppStart] App start tracking standalone root span (transaction).');

    if (!appStartEndData?.endFrames && NATIVE.enableNative) {
      try {
        const endFrames = await NATIVE.fetchNativeFrames();
        debug.log('[AppStart] Captured end frames for standalone app start.', endFrames);

        const currentTimestamp = appStartEndData?.timestampMs || timestampInSeconds() * 1000;
        _setAppStartEndData({
          timestampMs: currentTimestamp,
          endFrames,
        });
      } catch (error) {
        debug.log('[AppStart] Failed to capture frames for standalone app start.', error);
      }
    }

    const span = startInactiveSpan({
      forceTransaction: true,
      name: APP_START_TX_NAME,
      op: UI_LOAD_OP,
    });
    if (span instanceof SentryNonRecordingSpan) {
      // Tracing is disabled or the transaction was sampled
      return;
    }

    setEndTimeValue(span, timestampInSeconds());
    _client.emit('spanEnd', span);

    const event = convertSpanToTransaction(span);
    if (!event) {
      debug.warn('[AppStart] Failed to convert App Start span to transaction.');
      return;
    }

    await attachAppStartToTransactionEvent(event);
    if (!event.spans || event.spans.length === 0) {
      // No spans were added to the transaction, so we don't need to send it
      return;
    }

    const scope = getCapturedScopesOnSpan(span).scope || getCurrentScope();
    scope.captureEvent(event);
  }

  async function attachAppStartToTransactionEvent(event: TransactionEvent): Promise<void> {
    if (appStartDataFlushed) {
      // App start data is only relevant for the first transaction of the app run
      return;
    }

    if (!firstStartedActiveRootSpanId) {
      debug.warn('[AppStart] No first started active root span id recorded. Can not attach app start.');
      return;
    }

    if (!event.contexts?.trace) {
      debug.warn('[AppStart] Transaction event is missing trace context. Can not attach app start.');
      return;
    }

    if (firstStartedActiveRootSpanId !== event.contexts.trace.span_id) {
      debug.warn(
        '[AppStart] First started active root span id does not match the transaction event span id. Can not attached app start.',
      );
      return;
    }

    const appStart = await NATIVE.fetchNativeAppStart();
    if (!appStart) {
      debug.warn('[AppStart] Failed to retrieve the app start metrics from the native layer.');
      return;
    }
    if (appStart.has_fetched) {
      debug.warn('[AppStart] Measured app start metrics were already reported from the native layer.');
      return;
    }

    const appStartTimestampMs = appStart.app_start_timestamp_ms;
    if (!appStartTimestampMs) {
      debug.warn('[AppStart] App start timestamp could not be loaded from the native layer.');
      return;
    }

    const appStartEndTimestampMs = appStartEndData?.timestampMs || getBundleStartTimestampMs();
    if (!appStartEndTimestampMs) {
      debug.warn(
        '[AppStart] Javascript failed to record app start end. `_setAppStartEndData` was not called nor could the bundle start be found.',
      );
      return;
    }

    const isAppStartWithinBounds =
      !!event.start_timestamp && appStartTimestampMs >= event.start_timestamp * 1_000 - MAX_APP_START_AGE_MS;
    if (!__DEV__ && !isAppStartWithinBounds) {
      debug.warn('[AppStart] App start timestamp is too far in the past to be used for app start span.');
      return;
    }

    const appStartDurationMs = appStartEndTimestampMs - appStartTimestampMs;
    if (!__DEV__ && appStartDurationMs >= MAX_APP_START_DURATION_MS) {
      // Dev builds can have long app start waiting over minute for the first bundle to be produced
      debug.warn('[AppStart] App start duration is over a minute long, not adding app start span.');
      return;
    }

    if (appStartDurationMs < 0) {
      // This can happen when MainActivity on Android is recreated,
      // and the app start end timestamp is not updated, for example
      // due to missing `Sentry.wrap(RootComponent)` call.
      debug.warn(
        '[AppStart] Last recorded app start end timestamp is before the app start timestamp.',
        'This is usually caused by missing `Sentry.wrap(RootComponent)` call.',
      );
      return;
    }

    appStartDataFlushed = true;

    event.contexts.trace.data = event.contexts.trace.data || {};
    event.contexts.trace.data[SEMANTIC_ATTRIBUTE_SENTRY_OP] = UI_LOAD_OP;
    event.contexts.trace.op = UI_LOAD_OP;

    const origin = isRecordedAppStartEndTimestampMsManual ? SPAN_ORIGIN_MANUAL_APP_START : SPAN_ORIGIN_AUTO_APP_START;
    event.contexts.trace.data[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] = origin;
    event.contexts.trace.origin = origin;

    const appStartTimestampSeconds = appStartTimestampMs / 1000;
    event.start_timestamp = appStartTimestampSeconds;

    event.spans = event.spans || [];
    /** event.spans reference */
    const children: SpanJSON[] = event.spans;

    const maybeTtidSpan = children.find(({ op }) => op === 'ui.load.initial_display');
    if (maybeTtidSpan) {
      maybeTtidSpan.start_timestamp = appStartTimestampSeconds;
      setSpanDurationAsMeasurementOnTransactionEvent(event, 'time_to_initial_display', maybeTtidSpan);
    }

    const maybeTtfdSpan = children.find(({ op }) => op === 'ui.load.full_display');
    if (maybeTtfdSpan) {
      maybeTtfdSpan.start_timestamp = appStartTimestampSeconds;
      setSpanDurationAsMeasurementOnTransactionEvent(event, 'time_to_full_display', maybeTtfdSpan);
    }

    const appStartEndTimestampSeconds = appStartEndTimestampMs / 1000;
    if (event.timestamp && event.timestamp < appStartEndTimestampSeconds) {
      debug.log(
        '[AppStart] Transaction event timestamp is before app start end. Adjusting transaction event timestamp.',
      );
      event.timestamp = appStartEndTimestampSeconds;
    }

    const op = appStart.type === 'cold' ? APP_START_COLD_OP : APP_START_WARM_OP;
    const appStartSpanJSON: SpanJSON = createSpanJSON({
      op,
      description: appStart.type === 'cold' ? 'Cold Start' : 'Warm Start',
      start_timestamp: appStartTimestampSeconds,
      timestamp: appStartEndTimestampSeconds,
      trace_id: event.contexts.trace.trace_id,
      parent_span_id: event.contexts.trace.span_id,
      origin,
    });

    if (appStartEndData?.endFrames) {
      attachFrameDataToSpan(appStartSpanJSON, appStartEndData.endFrames);
    }

    const jsExecutionSpanJSON = createJSExecutionStartSpan(appStartSpanJSON, rootComponentCreationTimestampMs);

    const appStartSpans = [
      appStartSpanJSON,
      ...(jsExecutionSpanJSON ? [jsExecutionSpanJSON] : []),
      ...convertNativeSpansToSpanJSON(appStartSpanJSON, appStart.spans),
    ];

    children.push(...appStartSpans);
    debug.log('[AppStart] Added app start spans to transaction event.', JSON.stringify(appStartSpans, undefined, 2));

    const measurementKey = appStart.type === 'cold' ? APP_START_COLD_MEASUREMENT : APP_START_WARM_MEASUREMENT;
    const measurementValue = {
      value: appStartDurationMs,
      unit: 'millisecond',
    };
    event.measurements = event.measurements || {};
    event.measurements[measurementKey] = measurementValue;
    debug.log(
      '[AppStart] Added app start measurement to transaction event.',
      JSON.stringify(measurementValue, undefined, 2),
    );
  }

  return {
    name: INTEGRATION_NAME,
    setup,
    afterAllSetup,
    processEvent,
    captureStandaloneAppStart,
    setFirstStartedActiveRootSpanId,
  } as AppStartIntegration;
};

function setSpanDurationAsMeasurementOnTransactionEvent(event: TransactionEvent, label: string, span: SpanJSON): void {
  if (!span.timestamp || !span.start_timestamp) {
    debug.warn('Span is missing start or end timestamp. Cam not set measurement on transaction event.');
    return;
  }

  event.measurements = event.measurements || {};
  event.measurements[label] = {
    value: (span.timestamp - span.start_timestamp) * 1000,
    unit: 'millisecond',
  };
}

/**
 * Adds JS Execution before React Root. If `Sentry.wrap` is not used, create a span for the start of JS Bundle execution.
 */
function createJSExecutionStartSpan(
  parentSpan: SpanJSON,
  rootComponentCreationTimestampMs: number | undefined,
): SpanJSON | undefined {
  const bundleStartTimestampMs = getBundleStartTimestampMs();
  if (!bundleStartTimestampMs) {
    return undefined;
  }

  const bundleStartTimestampSeconds = bundleStartTimestampMs / 1000;
  if (bundleStartTimestampSeconds < parentSpan.start_timestamp) {
    debug.warn('Bundle start timestamp is before the app start span start timestamp. Skipping JS execution span.');
    return undefined;
  }

  if (!rootComponentCreationTimestampMs) {
    debug.warn('Missing the root component first constructor call timestamp.');
    return createChildSpanJSON(parentSpan, {
      description: 'JS Bundle Execution Start',
      start_timestamp: bundleStartTimestampSeconds,
      timestamp: bundleStartTimestampSeconds,
      origin: SPAN_ORIGIN_AUTO_APP_START,
    });
  }

  return createChildSpanJSON(parentSpan, {
    description: 'JS Bundle Execution Before React Root',
    start_timestamp: bundleStartTimestampSeconds,
    timestamp: rootComponentCreationTimestampMs / 1000,
    origin: isRootComponentCreationTimestampMsManual ? SPAN_ORIGIN_MANUAL_APP_START : SPAN_ORIGIN_AUTO_APP_START,
  });
}

/**
 * Adds native spans to the app start span.
 */
function convertNativeSpansToSpanJSON(parentSpan: SpanJSON, nativeSpans: NativeAppStartResponse['spans']): SpanJSON[] {
  return nativeSpans
    .filter(span => span.start_timestamp_ms / 1000 >= parentSpan.start_timestamp)
    .map(span => {
      if (span.description === 'UIKit init') {
        return setMainThreadInfo(createUIKitSpan(parentSpan, span));
      }

      return setMainThreadInfo(
        createChildSpanJSON(parentSpan, {
          description: span.description,
          start_timestamp: span.start_timestamp_ms / 1000,
          timestamp: span.end_timestamp_ms / 1000,
          origin: SPAN_ORIGIN_AUTO_APP_START,
        }),
      );
    });
}

/**
 * UIKit init is measured by the native layers till the native SDK start
 * RN initializes the native SDK later, the end timestamp would be wrong
 */
function createUIKitSpan(parentSpan: SpanJSON, nativeUIKitSpan: NativeAppStartResponse['spans'][number]): SpanJSON {
  const bundleStart = getBundleStartTimestampMs();

  // If UIKit init ends after the bundle start, the native SDK was auto-initialized
  // and so the end timestamp is incorrect.
  // The timestamps can't equal, as RN initializes after UIKit.
  if (bundleStart && bundleStart < nativeUIKitSpan.end_timestamp_ms) {
    return createChildSpanJSON(parentSpan, {
      description: 'UIKit Init to JS Exec Start',
      start_timestamp: nativeUIKitSpan.start_timestamp_ms / 1000,
      timestamp: bundleStart / 1000,
      origin: SPAN_ORIGIN_AUTO_APP_START,
    });
  } else {
    return createChildSpanJSON(parentSpan, {
      description: 'UIKit Init',
      start_timestamp: nativeUIKitSpan.start_timestamp_ms / 1000,
      timestamp: nativeUIKitSpan.end_timestamp_ms / 1000,
      origin: SPAN_ORIGIN_AUTO_APP_START,
    });
  }
}
