import type { Event, Integration, SpanJSON, TransactionEvent } from '@sentry/types';
import { logger } from '@sentry/utils';

import {
  APP_START_COLD as APP_START_COLD_MEASUREMENT,
  APP_START_WARM as APP_START_WARM_MEASUREMENT,
} from '../../measurements';
import type { NativeAppStartResponse } from '../../NativeRNSentry';
import { NATIVE } from '../../wrapper';
import {
  APP_START_COLD as APP_START_COLD_OP,
  APP_START_WARM as APP_START_WARM_OP,
  UI_LOAD as UI_LOAD_OP,
} from '../ops';
import { createChildSpanJSON, createSpanJSON, getBundleStartTimestampMs, getTimeOriginMilliseconds } from '../utils';

const INTEGRATION_NAME = 'AppStart';

/**
 * We filter out app start more than 60s.
 * This could be due to many different reasons.
 * We've seen app starts with hours, days and even months.
 */
const MAX_APP_START_DURATION_MS = 60000;

let useAppStartEndFromSentryRNProfiler = false;
let appStartEndTimestampMs: number | undefined = undefined;
let rootComponentCreationTimestampMs: number | undefined = undefined;

/**
 * Records the application start end.
 */
export const setAppStartEndTimestampMs = (timestampMs: number): void => {
  appStartEndTimestampMs && logger.warn('Overwriting already set app start.');
  appStartEndTimestampMs = timestampMs;
};

/**
 * Sets the App Start integration to use the application start end from the Sentry React Native Profiler.
 */
export const useAppStartFromSentryRNPProfiler = (): void => {
  useAppStartEndFromSentryRNProfiler = true;
};

/**
 * Sets the root component first constructor call timestamp.
 */
export function setRootComponentCreationTimestampMs(timestampMs: number): void {
  rootComponentCreationTimestampMs = timestampMs;
}

/**
 * Adds AppStart spans from the native layer to the transaction event.
 */
export const appStartIntegration = (): Integration => {
  let appStartDataFlushed = false;

  const setup = (): void => {
    if (!useAppStartEndFromSentryRNProfiler) {
      appStartEndTimestampMs = getTimeOriginMilliseconds();
    }
  };

  const processEvent = async (event: Event): Promise<Event> => {
    if (appStartDataFlushed) {
      return event;
    }

    if (event.type !== 'transaction') {
      // App start data is only relevant for transactions
      return event;
    }

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    await attachAppStartToTransactionEvent(event as TransactionEvent);

    return event;
  };

  async function attachAppStartToTransactionEvent(event: TransactionEvent): Promise<void> {
    if (!event.contexts || !event.contexts.trace) {
      logger.warn('[AppStart] Transaction event is missing trace context. Can not attach app start.');
      return;
    }

    const appStart = await NATIVE.fetchNativeAppStart();
    if (!appStart) {
      logger.warn('[AppStart] Failed to retrieve the app start metrics from the native layer.');
      return;
    }
    if (appStart.has_fetched) {
      logger.warn('[AppStart] Measured app start metrics were already reported from the native layer.');
      return;
    }

    const appStartTimestampMs = appStart.app_start_timestamp_ms;
    if (!appStartTimestampMs) {
      logger.warn('[AppStart] App start timestamp could not be loaded from the native layer.');
      return;
    }
    if (!appStartEndTimestampMs) {
      logger.warn('[AppStart] Javascript failed to record app start end.');
      return;
    }

    const appStartDurationMs = appStartEndTimestampMs - appStartTimestampMs;
    if (appStartDurationMs >= MAX_APP_START_DURATION_MS) {
      logger.warn('[AppStart] App start duration is over a minute long, not adding app start span.');
      return;
    }

    appStartDataFlushed = true;

    event.contexts.trace.data = event.contexts.trace.data || {};
    event.contexts.trace.data['SEMANTIC_ATTRIBUTE_SENTRY_OP'] = UI_LOAD_OP;

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

    const op = appStart.type === 'cold' ? APP_START_COLD_OP : APP_START_WARM_OP;
    const appStartSpanJSON: SpanJSON = createSpanJSON({
      op,
      description: appStart.type === 'cold' ? 'Cold App Start' : 'Warm App Start',
      start_timestamp: appStartTimestampSeconds,
      timestamp: appStartEndTimestampMs / 1000,
      trace_id: event.contexts.trace.trace_id,
      parent_span_id: event.contexts.trace.span_id,
      origin: 'auto',
    });
    const jsExecutionSpanJSON = createJSExecutionBeforeRoot(appStartSpanJSON, rootComponentCreationTimestampMs);

    const appStartSpans = [
      appStartSpanJSON,
      ...(jsExecutionSpanJSON ? [jsExecutionSpanJSON] : []),
      ...convertNativeSpansToSpanJSON(appStartSpanJSON, appStart.spans),
    ];

    children.push(...appStartSpans);
    logger.debug('[AppStart] Added app start spans to transaction event.', JSON.stringify(appStartSpans, undefined, 2));

    const measurementKey = appStart.type === 'cold' ? APP_START_COLD_MEASUREMENT : APP_START_WARM_MEASUREMENT;
    const measurementValue = {
      value: appStartDurationMs,
      unit: 'millisecond',
    };
    event.measurements = event.measurements || {};
    event.measurements[measurementKey] = measurementValue;
    logger.debug(
      `[AppStart] Added app start measurement to transaction event.`,
      JSON.stringify(measurementValue, undefined, 2),
    );
  }

  return {
    name: INTEGRATION_NAME,
    setup,
    processEvent,
  };
};

function setSpanDurationAsMeasurementOnTransactionEvent(event: TransactionEvent, label: string, span: SpanJSON): void {
  if (!span.timestamp || !span.start_timestamp) {
    logger.warn('Span is missing start or end timestamp. Cam not set measurement on transaction event.');
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
function createJSExecutionBeforeRoot(
  parentSpan: SpanJSON,
  rootComponentCreationTimestampMs: number | undefined,
): SpanJSON | undefined {
  const bundleStartTimestampMs = getBundleStartTimestampMs();
  if (!bundleStartTimestampMs) {
    return;
  }

  if (!rootComponentCreationTimestampMs) {
    logger.warn('Missing the root component first constructor call timestamp.');
    return createChildSpanJSON(parentSpan, {
      description: 'JS Bundle Execution Start',
      start_timestamp: bundleStartTimestampMs / 1000,
      timestamp: bundleStartTimestampMs / 1000,
    });
  }

  return createChildSpanJSON(parentSpan, {
    description: 'JS Bundle Execution Before React Root',
    start_timestamp: bundleStartTimestampMs / 1000,
    timestamp: rootComponentCreationTimestampMs / 1000,
  });
}

/**
 * Adds native spans to the app start span.
 */
function convertNativeSpansToSpanJSON(parentSpan: SpanJSON, nativeSpans: NativeAppStartResponse['spans']): SpanJSON[] {
  return nativeSpans.map(span => {
    const spanJSON = createChildSpanJSON(parentSpan, {
      description: span.description,
      start_timestamp: span.start_timestamp_ms / 1000,
      timestamp: span.end_timestamp_ms / 1000,
    });

    if (span.description === 'UIKit init') {
      // TODO: check based on time
      // UIKit init is measured by the native layers till the native SDK start
      // RN initializes the native SDK later, the end timestamp would be wrong
      spanJSON.timestamp = spanJSON.start_timestamp;
      spanJSON.description = 'UIKit init start';
    }

    return spanJSON;
  });
}
