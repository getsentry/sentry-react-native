import type { Event, Integration, SpanJSON, TransactionEvent } from '@sentry/types';
import { logger, uuid4 } from '@sentry/utils';

import {
  APP_START_COLD as APP_START_COLD_MEASUREMENT,
  APP_START_WARM as APP_START_WARM_MEASUREMENT,
} from '../../measurements';
import { NATIVE } from '../../wrapper';
import {
  APP_START_COLD as APP_START_COLD_OP,
  APP_START_WARM as APP_START_WARM_OP,
  UI_LOAD as UI_LOAD_OP,
} from '../ops';
import { getTimeOriginMilliseconds } from '../utils';

const INTEGRATION_NAME = 'AppStart';

/**
 * We filter out app start more than 60s.
 * This could be due to many different reasons.
 * We've seen app starts with hours, days and even months.
 */
const MAX_APP_START_DURATION_MS = 60000;

let useAppStartEndFromSentryRNProfiler = false;
let appStartEndTimestampMs: number | undefined = undefined;

/**
 * Records the application start end.
 */
export const setAppStartEndTimestamp = (timestamp: number): void => {
  appStartEndTimestampMs && logger.warn('Overwriting already set app start.');
  appStartEndTimestampMs = timestamp;
};

/**
 * Sets the App Start integration to use the application start end from the Sentry React Native Profiler.
 */
export const useAppStartFromSentryRNPProfiler = (): void => {
  useAppStartEndFromSentryRNProfiler = true;
};

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
    attachAppStartToTransactionEvent(event as TransactionEvent);

    return event;
  };

  async function attachAppStartToTransactionEvent(event: TransactionEvent): Promise<void> {
    if (!event.contexts || !event.contexts.trace) {
      logger.warn('Transaction event is missing trace context. Can not attach app start.');
      return;
    }

    event.contexts.trace.data = event.contexts.trace.data || {};
    event.contexts.trace.data['SEMANTIC_ATTRIBUTE_SENTRY_OP'] = UI_LOAD_OP;

    const appStart = await NATIVE.fetchNativeAppStart();

    if (!appStart) {
      logger.warn('Failed to retrieve the app start metrics from the native layer.');
      return;
    }

    if (appStart.didFetchAppStart) {
      logger.warn('Measured app start metrics were already reported from the native layer.');
      return;
    }

    if (!appStartEndTimestampMs) {
      logger.warn('Javascript failed to record app start end.');
      return;
    }

    const appStartDurationMs = appStartEndTimestampMs - appStart.appStartTime;

    if (appStartDurationMs >= MAX_APP_START_DURATION_MS) {
      return;
    }

    appStartDataFlushed = true;

    const appStartTimestampSeconds = appStart.appStartTime / 1000;
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

    const op = appStart.isColdStart ? APP_START_COLD_OP : APP_START_WARM_OP;

    children.push({
      description: appStart.isColdStart ? 'Cold App Start' : 'Warm App Start',
      op,
      start_timestamp: appStartTimestampSeconds,
      timestamp: appStartEndTimestampMs / 1000,
      trace_id: event.contexts.trace.trace_id,
      span_id: uuid4(),
    });
    const measurement = appStart.isColdStart ? APP_START_COLD_MEASUREMENT : APP_START_WARM_MEASUREMENT;

    event.measurements = event.measurements || {};
    event.measurements[measurement] = {
      value: appStartDurationMs,
      unit: 'millisecond',
    };
  }

  return {
    name: INTEGRATION_NAME,
    setupOnce: () => {
      // noop
    },
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
