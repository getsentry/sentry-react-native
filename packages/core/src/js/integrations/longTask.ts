import type { Client, Integration, Span } from '@sentry/core';
import type { AppStateStatus } from 'react-native';

import {
  debug,
  metrics,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME,
  spanToJSON,
  timestampInSeconds,
} from '@sentry/core';
import { AppState } from 'react-native';

import type { ReactNativeClient } from '../client';

import { _getAppStartEndTimestampMs } from '../tracing/integrations/appStart';
import { isRootSpan } from '../utils/span';
import { RN_GLOBAL_OBJ } from '../utils/worldwide';

const INTEGRATION_NAME = 'LongTask';

const METRIC_NAME = 'react_native.long_task.duration';
const ORIGIN = 'auto.react_native.long_task';

/** Long tasks that wait for the app start end are reported without the phase after this delay. */
const APP_START_END_DEADLINE_MS = 30_000;
/** Caps the memory of the context history and of the long tasks that wait for the app start end. */
const MAX_HISTORY_LENGTH = 50;

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
  /** In seconds, on the SDK clock. */
  startTimestamp: number;
  durationMs: number;
}

interface Change<T> {
  /** In seconds, on the SDK clock. */
  timestamp: number;
  value: T;
}

interface RootSpanRecord {
  span: Span;
  /** In seconds, on the SDK clock. */
  endTimestamp?: number;
}

/**
 * Reports JS thread long tasks as the `react_native.long_task.duration` distribution metric,
 * independently of tracing.
 *
 * Each metric has the route, the foreground state, the app start phase and the root span
 * at the time the task started.
 *
 * Requires React Native 0.82 or newer on the New Architecture.
 * In other environments, the integration does nothing.
 */
export const longTaskIntegration = (options: LongTaskOptions = {}): Integration => {
  const { minDurationMs = 200, sampleRate = 1 } = options;

  return {
    name: INTEGRATION_NAME,
    setup(client: Client): void {
      if (client.getOptions().enableMetrics === false) {
        debug.log(`[${INTEGRATION_NAME}] Metrics are disabled, long tasks will not be reported.`);
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

        // React Native delivers entries to the observer callback with idle priority, which can be long
        // after the task ends. The context is read from its history at the start time of the task.
        const routes: Change<string>[] = [];
        const appStates: Change<AppStateStatus>[] = [{ timestamp: -Infinity, value: AppState.currentState }];
        const rootSpans: RootSpanRecord[] = [];
        let waitingForAppStartEnd: LongTask[] | undefined = [];

        const report = ({ startTimestamp, durationMs }: LongTask): void => {
          const attributes: Record<string, string | boolean> = { [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN };

          const route = valueAt(routes, startTimestamp);
          if (route) {
            attributes.route = route;
          }

          const appState = valueAt(appStates, startTimestamp);
          if (appState && appState !== 'unknown') {
            attributes['app.in_foreground'] = appState === 'active';
          }

          const appStartEndMs = _getAppStartEndTimestampMs();
          if (appStartEndMs !== undefined) {
            attributes['app.start_phase'] = startTimestamp * 1000 < appStartEndMs ? 'app_start' : 'steady_state';
          }

          const rootSpan = rootSpanAt(rootSpans, startTimestamp);
          if (rootSpan) {
            const { description, op } = spanToJSON(rootSpan);
            if (description) {
              attributes[SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME] = description;
            }
            if (op) {
              attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] = op;
            }
          }

          metrics.distribution(METRIC_NAME, durationMs, { unit: 'millisecond', attributes });
        };

        const reportWaitingForAppStartEnd = (): void => {
          const longTasks = waitingForAppStartEnd ?? [];
          waitingForAppStartEnd = undefined;
          longTasks.forEach(report);
        };

        const rnClient = client as ReactNativeClient;
        rnClient.on('currentRouteChange', (route: string) => {
          push(routes, { timestamp: timestampInSeconds(), value: route });
        });
        rnClient.on('appStartEnd', reportWaitingForAppStartEnd);
        const appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
          push(appStates, { timestamp: timestampInSeconds(), value: state });
        });
        client.on('spanStart', (span: Span) => {
          if (isRootSpan(span)) {
            push(rootSpans, { span });
          }
        });
        client.on('spanEnd', (span: Span) => {
          const record = isRootSpan(span) && rootSpans.find(r => r.span === span);
          if (record) {
            record.endTimestamp = spanToJSON(span).timestamp;
          }
        });

        // Without the app start end, the phase of a task is unknown. The tasks wait for it until the deadline.
        const appStartEndDeadline = setTimeout(reportWaitingForAppStartEnd, APP_START_END_DEADLINE_MS);

        const observer = new PerformanceObserver(list => {
          // Entry times use the `performance.now()` clock. Converting them relative to now matches the SDK
          // timestamps also when the SDK ignores an unreliable `performance.timeOrigin`.
          const nowSeconds = timestampInSeconds();
          const nowMs = performance.now();

          for (const { startTime, duration } of list.getEntries()) {
            if (duration < minDurationMs) {
              continue;
            }
            const longTask = { startTimestamp: nowSeconds - (nowMs - startTime) / 1000, durationMs: duration };
            if (waitingForAppStartEnd && _getAppStartEndTimestampMs() === undefined) {
              waitingForAppStartEnd.push(longTask);
              if (waitingForAppStartEnd.length > MAX_HISTORY_LENGTH) {
                report(waitingForAppStartEnd.shift()!);
              }
            } else {
              reportWaitingForAppStartEnd();
              report(longTask);
            }
          }
        });
        observer.observe({ type: 'longtask', buffered: true });

        client.on('close', () => {
          observer.disconnect();
          appStateSubscription.remove();
          clearTimeout(appStartEndDeadline);
          reportWaitingForAppStartEnd();
        });
      } catch (error) {
        debug.warn(`[${INTEGRATION_NAME}] Failed to observe long tasks.`, error);
      }
    },
  };
};

const push = <T>(list: T[], item: T): void => {
  list.push(item);
  if (list.length > MAX_HISTORY_LENGTH) {
    list.shift();
  }
};

const valueAt = <T>(changes: Change<T>[], timestamp: number): T | undefined => {
  for (let i = changes.length - 1; i >= 0; i--) {
    const change = changes[i];
    if (change && change.timestamp <= timestamp) {
      return change.value;
    }
  }
  return undefined;
};

const rootSpanAt = (records: RootSpanRecord[], timestamp: number): Span | undefined => {
  for (let i = records.length - 1; i >= 0; i--) {
    const record = records[i];
    if (
      record &&
      spanToJSON(record.span).start_timestamp <= timestamp &&
      (record.endTimestamp === undefined || timestamp < record.endTimestamp)
    ) {
      return record.span;
    }
  }
  return undefined;
};
