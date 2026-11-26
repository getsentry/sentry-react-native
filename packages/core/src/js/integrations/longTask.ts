import type { Client, Event, Integration, Span } from '@sentry/core';

import {
  debug,
  getActiveSpan,
  getRootSpan,
  hasSpansEnabled,
  metrics,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  spanToJSON,
  startInactiveSpan,
  timestampInSeconds,
} from '@sentry/core';

import { SPAN_THREAD_NAME, SPAN_THREAD_NAME_JAVASCRIPT } from '../tracing/span';
import { createSpanJSON } from '../tracing/utils';
import { RN_GLOBAL_OBJ } from '../utils/worldwide';

const INTEGRATION_NAME = 'LongTask';

const METRIC_NAME = 'react_native.long_task.duration';
const METRIC_OPTIONS = {
  unit: 'millisecond',
  attributes: { [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.react_native.long_task' },
};
const SPAN_OP = 'ui.long-task';
const SPAN_NAME = 'JS thread blocked';
const SPAN_ORIGIN = 'auto.ui.long_task';
const SPAN_ATTRIBUTES = {
  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: SPAN_ORIGIN,
  [SPAN_THREAD_NAME]: SPAN_THREAD_NAME_JAVASCRIPT,
};

/** Caps the memory of long tasks kept for transactions that have not ended yet. */
const MAX_BUFFERED_LONG_TASKS = 100;

/** Options for {@link longTaskIntegration}. */
export interface LongTaskOptions {
  /**
   * The minimum duration in milliseconds of a JS task to report it.
   * React Native reports only tasks of 50 ms or longer, so a lower value has no effect.
   *
   * @default 200
   */
  minDurationMs?: number;
  /**
   * The probability (0.0 to 1.0) that an app launch reports its long tasks.
   * The SDK decides once per SDK init. A launch reports all of its long tasks or none of them.
   * Sentry does not scale the metric counts by this rate.
   *
   * @default 1
   */
  sampleRate?: number;
}

interface LongTask {
  startTimestamp: number;
  endTimestamp: number;
}

/**
 * Reports JS thread long tasks as the `react_native.long_task.duration` distribution metric,
 * independently of tracing. When tracing is enabled, it also adds the long tasks that overlap
 * a transaction as `ui.long-task` child spans.
 *
 * Requires React Native 0.82 or newer on the New Architecture.
 * In other environments, the integration does nothing.
 */
export const longTaskIntegration = (options: LongTaskOptions = {}): Integration => {
  const { minDurationMs = 200, sampleRate = 1 } = options;

  const longTasks: LongTask[] = [];
  let readPendingLongTasks: (() => void) | undefined;

  return {
    name: INTEGRATION_NAME,
    setup(client: Client): void {
      const reportMetrics = client.getOptions().enableMetrics !== false;
      const reportSpans = hasSpansEnabled(client.getOptions());
      if (!reportMetrics && !reportSpans) {
        debug.log(`[${INTEGRATION_NAME}] Metrics and tracing are disabled, long tasks will not be reported.`);
        return;
      }

      try {
        // Reading the lazy global loads the RN module, and `supportedEntryTypes` calls into native code.
        const { PerformanceObserver, performance } = RN_GLOBAL_OBJ;
        if (!performance || !PerformanceObserver?.supportedEntryTypes?.includes('longtask')) {
          debug.log(`[${INTEGRATION_NAME}] Long tasks are not supported in this environment.`);
          return;
        }

        if (Math.random() >= sampleRate) {
          return;
        }

        const record = (entries: ReadonlyArray<{ startTime: number; duration: number }>, openRootSpan?: Span): void => {
          // Entry times use the `performance.now()` clock. Converting them relative to now matches span
          // timestamps also when the SDK ignores an unreliable `performance.timeOrigin`.
          const nowSeconds = timestampInSeconds();
          const nowMs = performance.now();

          for (const { startTime, duration } of entries) {
            if (duration < minDurationMs) {
              continue;
            }
            if (reportMetrics) {
              metrics.distribution(METRIC_NAME, duration, METRIC_OPTIONS);
            }
            if (!reportSpans) {
              continue;
            }

            const startTimestamp = nowSeconds - (nowMs - startTime) / 1000;
            const endTimestamp = startTimestamp + duration / 1000;
            if (openRootSpan && endTimestamp > spanToJSON(openRootSpan).start_timestamp) {
              // A real child span keeps an idle transaction open, so it is not trimmed to its last child.
              startInactiveSpan({
                parentSpan: openRootSpan,
                name: SPAN_NAME,
                op: SPAN_OP,
                startTime: startTimestamp,
                attributes: SPAN_ATTRIBUTES,
              }).end(endTimestamp);
            } else {
              longTasks.push({ startTimestamp, endTimestamp });
            }
          }

          if (longTasks.length > MAX_BUFFERED_LONG_TASKS) {
            longTasks.splice(0, longTasks.length - MAX_BUFFERED_LONG_TASKS);
          }
        };

        const observer = new PerformanceObserver(list => record(list.getEntries(), getOpenRootSpan()));
        observer.observe({ type: 'longtask', buffered: true });
        client.on('close', () => observer.disconnect());

        if (reportSpans) {
          // React Native delivers entries to the observer callback with idle priority, often after the
          // transaction ends, so the transaction reads the entries that are not delivered yet.
          readPendingLongTasks = () => record(observer.takeRecords());
        }
      } catch (error) {
        debug.warn(`[${INTEGRATION_NAME}] Failed to observe long tasks.`, error);
      }
    },
    processEvent(event: Event): Event {
      if (!readPendingLongTasks || event.type !== 'transaction') {
        return event;
      }

      try {
        readPendingLongTasks();
      } catch (error) {
        debug.warn(`[${INTEGRATION_NAME}] Failed to read pending long tasks.`, error);
      }

      const { start_timestamp: transactionStart, timestamp: transactionEnd } = event;
      const trace = event.contexts?.trace;
      if (transactionStart === undefined || transactionEnd === undefined || !trace) {
        return event;
      }

      for (const { startTimestamp, endTimestamp } of longTasks) {
        if (startTimestamp < transactionEnd && endTimestamp > transactionStart) {
          event.spans = event.spans ?? [];
          event.spans.push(
            createSpanJSON({
              op: SPAN_OP,
              description: SPAN_NAME,
              origin: SPAN_ORIGIN,
              start_timestamp: startTimestamp,
              timestamp: endTimestamp,
              trace_id: trace.trace_id,
              parent_span_id: trace.span_id,
              data: { [SPAN_THREAD_NAME]: SPAN_THREAD_NAME_JAVASCRIPT },
            }),
          );
        }
      }

      return event;
    },
  };
};

const getOpenRootSpan = (): Span | undefined => {
  const activeSpan = getActiveSpan();
  const rootSpan = activeSpan && getRootSpan(activeSpan);
  return rootSpan?.isRecording() ? rootSpan : undefined;
};
