/* eslint-disable max-lines */
import type { Client, Integration, Measurements, MeasurementUnit, Span } from '@sentry/core';
import { getRootSpan, logger, spanToJSON, timestampInSeconds } from '@sentry/core';
import type { AppStateStatus } from 'react-native';
import { AppState } from 'react-native';

import { STALL_COUNT, STALL_LONGEST_TIME, STALL_TOTAL_TIME } from '../../measurements';
import { isRootSpan } from '../../utils/span';
import { getLatestChildSpanEndTimestamp, isNearToNow, setSpanMeasurement } from '../utils';

const INTEGRATION_NAME = 'StallTracking';

export interface StallMeasurements extends Measurements {
  [STALL_COUNT]: { value: number; unit: MeasurementUnit };
  [STALL_TOTAL_TIME]: { value: number; unit: MeasurementUnit };
  [STALL_LONGEST_TIME]: { value: number; unit: MeasurementUnit };
}

/** Margin of error of 20ms */
const MARGIN_OF_ERROR_SECONDS = 0.02;
/** How long between each iteration in the event loop tracker timeout */
const LOOP_TIMEOUT_INTERVAL_MS = 50;
/** Limit for how many transactions the stall tracker will track at a time to prevent leaks due to transactions not being finished */
const MAX_RUNNING_TRANSACTIONS = 10;

/**
 * Stall measurement tracker inspired by the `JSEventLoopWatchdog` used internally in React Native:
 * https://github.com/facebook/react-native/blob/006f5afe120c290a37cf6ff896748fbc062bf7ed/Libraries/Interaction/JSEventLoopWatchdog.js
 *
 * However, we modified the interval implementation to instead have a fixed loop timeout interval of `LOOP_TIMEOUT_INTERVAL_MS`.
 * We then would consider that iteration a stall when the total time for that interval to run is greater than `LOOP_TIMEOUT_INTERVAL_MS + minimumStallThreshold`
 */
export const stallTrackingIntegration = ({
  minimumStallThresholdMs = 50,
}: {
  /**
   * How long in milliseconds an event loop iteration can be delayed for before being considered a "stall."
   * @default 50
   */
  minimumStallThresholdMs?: number;
} = {}): Integration => {
  const statsByRootSpan: Map<
    Span,
    {
      longestStallTime: number;
      atStart: StallMeasurements;
      atTimestamp: {
        timestamp: number;
        stats: StallMeasurements;
      } | null;
    }
  > = new Map();

  const state: {
    isTracking: boolean;
    timeout: ReturnType<typeof setTimeout> | null;
    isBackground: boolean;
    /** Switch that enables the iteration once app moves from background to foreground. */
    backgroundEventListener: (appState: AppStateStatus) => void;
    /** The last timestamp the iteration ran in milliseconds */
    lastIntervalMs: number;
    /** Total amount of time of all stalls that occurred during the current tracking session */
    totalStallTime: number;
    /** Total number of stalls that occurred during the current tracking session */
    stallCount: number;
    /**
     * Iteration of the stall tracking interval. Measures how long the timer strayed from its expected time of running, and how
     * long the stall is for.
     */
    iteration: () => void;
  } = {
    isTracking: false,
    timeout: null,
    isBackground: false,
    lastIntervalMs: 0,
    totalStallTime: 0,
    stallCount: 0,
    backgroundEventListener: (appState: AppStateStatus): void => {
      if (appState === ('active' as AppStateStatus)) {
        state.isBackground = false;
        if (state.timeout != null) {
          state.lastIntervalMs = timestampInSeconds() * 1000;
          state.iteration();
        }
      } else {
        state.isBackground = true;
        state.timeout !== null && clearTimeout(state.timeout);
      }
    },
    iteration: (): void => {
      const now = timestampInSeconds() * 1000;
      const totalTimeTaken = now - state.lastIntervalMs;

      if (totalTimeTaken >= LOOP_TIMEOUT_INTERVAL_MS + minimumStallThresholdMs) {
        const stallTime = totalTimeTaken - LOOP_TIMEOUT_INTERVAL_MS;
        state.stallCount += 1;
        state.totalStallTime += stallTime;

        for (const [transaction, value] of statsByRootSpan.entries()) {
          const longestStallTime = Math.max(value.longestStallTime ?? 0, stallTime);

          statsByRootSpan.set(transaction, {
            ...value,
            longestStallTime,
          });
        }
      }

      state.lastIntervalMs = now;

      if (state.isTracking && !state.isBackground) {
        state.timeout = setTimeout(state.iteration, LOOP_TIMEOUT_INTERVAL_MS);
      }
    },
  };

  const setup = (client: Client): void => {
    client.on('spanStart', _onSpanStart);
    client.on('spanEnd', _onSpanEnd);
  };

  const _onSpanStart = (rootSpan: Span): void => {
    if (!isRootSpan(rootSpan)) {
      return;
    }

    if (statsByRootSpan.has(rootSpan)) {
      logger.error(
        '[StallTracking] Tried to start stall tracking on a transaction already being tracked. Measurements might be lost.',
      );
      return;
    }

    _startTracking();
    statsByRootSpan.set(rootSpan, {
      longestStallTime: 0,
      atTimestamp: null,
      atStart: _getCurrentStats(rootSpan),
    });
    _flushLeakedTransactions();
  };

  const _onSpanEnd = (rootSpan: Span): void => {
    if (!isRootSpan(rootSpan)) {
      return _onChildSpanEnd(rootSpan);
    }

    const transactionStats = statsByRootSpan.get(rootSpan);

    if (!transactionStats) {
      // Transaction has been flushed out somehow, we return null.
      logger.log('[StallTracking] Stall measurements were not added to transaction due to exceeding the max count.');

      statsByRootSpan.delete(rootSpan);
      _shouldStopTracking();

      return;
    }

    // The endTimestamp is always set, but type-wise it's optional
    // https://github.com/getsentry/sentry-javascript/blob/38bd57b0785c97c413f36f89ff931d927e469078/packages/core/src/tracing/sentrySpan.ts#L170
    const endTimestamp = spanToJSON(rootSpan).timestamp;

    let statsOnFinish: StallMeasurements | undefined;
    if (isNearToNow(endTimestamp)) {
      statsOnFinish = _getCurrentStats(rootSpan);
    } else {
      // The idleSpan in JS V8 is always trimmed to the last span's endTimestamp (timestamp).
      // The unfinished child spans are removed from the root span after the `spanEnd` event.

      const latestChildSpanEnd = getLatestChildSpanEndTimestamp(rootSpan);
      if (latestChildSpanEnd !== endTimestamp) {
        logger.log(
          '[StallTracking] Stall measurements not added due to a custom `endTimestamp` (root end is not equal to the latest child span end).',
        );
      }

      if (!transactionStats.atTimestamp) {
        logger.log(
          '[StallTracking] Stall measurements not added due to `endTimestamp` not being close to now. And no previous stats from child end were found.',
        );
      }

      if (latestChildSpanEnd === endTimestamp && transactionStats.atTimestamp) {
        statsOnFinish = transactionStats.atTimestamp.stats;
      }
    }

    statsByRootSpan.delete(rootSpan);
    _shouldStopTracking();

    if (!statsOnFinish) {
      if (typeof endTimestamp !== 'undefined') {
        logger.log(
          '[StallTracking] Stall measurements not added due to `endTimestamp` not being close to now.',
          'endTimestamp',
          endTimestamp,
          'now',
          timestampInSeconds(),
        );
      }

      return;
    }

    setSpanMeasurement(
      rootSpan,
      STALL_COUNT,
      statsOnFinish.stall_count.value - transactionStats.atStart.stall_count.value,
      transactionStats.atStart.stall_count.unit,
    );

    setSpanMeasurement(
      rootSpan,
      STALL_TOTAL_TIME,
      statsOnFinish.stall_total_time.value - transactionStats.atStart.stall_total_time.value,
      transactionStats.atStart.stall_total_time.unit,
    );

    setSpanMeasurement(
      rootSpan,
      STALL_LONGEST_TIME,
      statsOnFinish.stall_longest_time.value,
      statsOnFinish.stall_longest_time.unit,
    );
  };

  const _onChildSpanEnd = (childSpan: Span): void => {
    const rootSpan = getRootSpan(childSpan);

    const finalEndTimestamp = spanToJSON(childSpan).timestamp;
    if (finalEndTimestamp) {
      _markSpanFinish(rootSpan, finalEndTimestamp);
    }
  };

  /**
   * Logs the finish time of the span for use in `trimEnd: true` transactions.
   */
  const _markSpanFinish = (rootSpan: Span, childSpanEndTime: number): void => {
    const previousStats = statsByRootSpan.get(rootSpan);
    if (previousStats) {
      if (Math.abs(timestampInSeconds() - childSpanEndTime) > MARGIN_OF_ERROR_SECONDS) {
        logger.log(
          '[StallTracking] Span end not logged due to end timestamp being outside the margin of error from now.',
        );

        if (previousStats.atTimestamp && previousStats.atTimestamp.timestamp < childSpanEndTime) {
          // We also need to delete the stat for the last span, as the transaction would be trimmed to this span not the last one.
          statsByRootSpan.set(rootSpan, {
            ...previousStats,
            atTimestamp: null,
          });
        }
      } else {
        statsByRootSpan.set(rootSpan, {
          ...previousStats,
          atTimestamp: {
            timestamp: childSpanEndTime,
            stats: _getCurrentStats(rootSpan),
          },
        });
      }
    }
  };

  /**
   * Get the current stats for a transaction at a given time.
   */
  const _getCurrentStats = (span: Span): StallMeasurements => {
    return {
      stall_count: { value: state.stallCount, unit: 'none' },
      stall_total_time: { value: state.totalStallTime, unit: 'millisecond' },
      stall_longest_time: {
        value: statsByRootSpan.get(span)?.longestStallTime ?? 0,
        unit: 'millisecond',
      },
    };
  };

  /**
   * Start tracking stalls
   */
  const _startTracking = (): void => {
    if (!state.isTracking) {
      state.isTracking = true;
      state.lastIntervalMs = Math.floor(timestampInSeconds() * 1000);

      state.iteration();
    }
  };

  /**
   * Stops the stall tracking interval and calls reset().
   */
  const _stopTracking = (): void => {
    state.isTracking = false;

    if (state.timeout !== null) {
      clearTimeout(state.timeout);
      state.timeout = null;
    }

    _reset();
  };

  /**
   * Will stop tracking if there are no more transactions.
   */
  const _shouldStopTracking = (): void => {
    if (statsByRootSpan.size === 0) {
      _stopTracking();
    }
  };

  /**
   * Clears all the collected stats
   */
  const _reset = (): void => {
    state.stallCount = 0;
    state.totalStallTime = 0;
    state.lastIntervalMs = 0;
    statsByRootSpan.clear();
  };

  /**
   * Deletes leaked transactions (Earliest transactions when we have more than MAX_RUNNING_TRANSACTIONS transactions.)
   */
  const _flushLeakedTransactions = (): void => {
    if (statsByRootSpan.size > MAX_RUNNING_TRANSACTIONS) {
      let counter = 0;
      const len = statsByRootSpan.size - MAX_RUNNING_TRANSACTIONS;
      const transactions = statsByRootSpan.keys();
      for (const t of transactions) {
        if (counter >= len) break;
        counter += 1;
        statsByRootSpan.delete(t);
      }
    }
  };

  // Avoids throwing any error if using React Native on a environment that doesn't implement AppState.
  if (AppState?.isAvailable) {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    AppState.addEventListener('change', state.backgroundEventListener);
  }

  return {
    name: INTEGRATION_NAME,
    setup,

    /** For testing only @private */
    _internalState: state,
  } as Integration;
};
