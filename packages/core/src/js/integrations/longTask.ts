import type { Client, Integration } from '@sentry/core';

import { debug, metrics } from '@sentry/core';

import { RN_GLOBAL_OBJ } from '../utils/worldwide';

const INTEGRATION_NAME = 'LongTask';

const METRIC_NAME = 'react_native.long_task.duration';
const METRIC_OPTIONS = { unit: 'millisecond', attributes: { 'sentry.origin': 'auto.react_native.long_task' } };

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
   * The probability (0 to 1) that an app launch reports its long tasks.
   * The SDK decides once per launch. A launch reports all of its long tasks or none of them.
   * Sentry does not scale the metric counts by this rate.
   *
   * @default 1
   */
  sampleRate?: number;
}

/**
 * Reports JS thread long tasks as the `react_native.long_task.duration` distribution metric,
 * independently of tracing.
 *
 * Requires React Native 0.82 or newer on the New Architecture.
 * In other environments, the integration does nothing.
 */
export const longTaskIntegration = (options: LongTaskOptions = {}): Integration => {
  const { minDurationMs = 200, sampleRate = 1 } = options;

  return {
    name: INTEGRATION_NAME,
    setup(client: Client): void {
      const PerformanceObserver = RN_GLOBAL_OBJ.PerformanceObserver;
      if (!PerformanceObserver?.supportedEntryTypes?.includes('longtask')) {
        debug.log(`[${INTEGRATION_NAME}] Long tasks are not supported in this environment.`);
        return;
      }

      if (Math.random() >= sampleRate) {
        return;
      }

      try {
        const observer = new PerformanceObserver(list => {
          for (const { duration } of list.getEntries()) {
            if (duration >= minDurationMs) {
              metrics.distribution(METRIC_NAME, duration, METRIC_OPTIONS);
            }
          }
        });
        observer.observe({ type: 'longtask', buffered: true });
        client.on('close', () => observer.disconnect());
      } catch (error) {
        debug.warn(`[${INTEGRATION_NAME}] Failed to observe long tasks.`, error);
      }
    },
  };
};
