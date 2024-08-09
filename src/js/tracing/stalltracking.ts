/* eslint-disable max-lines */
import { getRootSpan, spanToJSON } from '@sentry/core';
import type { Client, Integration, Measurements, MeasurementUnit, Span } from '@sentry/types';
import { logger, timestampInSeconds } from '@sentry/utils';
import type { AppStateStatus } from 'react-native';
import { AppState } from 'react-native';

import { STALL_COUNT, STALL_LONGEST_TIME, STALL_TOTAL_TIME } from '../measurements';
import { isRootSpan } from '../utils/span';
import { getLatestChildSpanEndTimestamp, isNearToNow, setSpanMeasurement } from './utils';

export interface StallMeasurements extends Measurements {
  [STALL_COUNT]: { value: number; unit: MeasurementUnit };
  [STALL_TOTAL_TIME]: { value: number; unit: MeasurementUnit };
  [STALL_LONGEST_TIME]: { value: number; unit: MeasurementUnit };
}

export type StallTrackingOptions = {
  /**
   * How long in milliseconds an event loop iteration can be delayed for before being considered a "stall."
   * @default 100
   */
  minimumStallThreshold: number;
};

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
export class StallTrackingInstrumentation implements Integration {
  public name: string = 'StallTrackingInstrumentation';

  public isTracking: boolean = false;

  private _minimumStallThreshold: number;

  /** Total amount of time of all stalls that occurred during the current tracking session */
  private _totalStallTime: number = 0;
  /** Total number of stalls that occurred during the current tracking session */
  private _stallCount: number = 0;

  /** The last timestamp the iteration ran in milliseconds */
  private _lastIntervalMs: number = 0;
  private _timeout: ReturnType<typeof setTimeout> | null = null;

  private _isBackground: boolean = false;

  private _statsByRootSpan: Map<
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

  public constructor(options: StallTrackingOptions = { minimumStallThreshold: 50 }) {
    this._minimumStallThreshold = options.minimumStallThreshold;

    this._backgroundEventListener = this._backgroundEventListener.bind(this);
    // Avoids throwing any error if using React Native on a environment that doesn't implement AppState.
    if (AppState?.isAvailable) {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      AppState.addEventListener('change', this._backgroundEventListener);
    }
  }

  /**
   * @inheritDoc
   */
  public setup(client: Client): void {
    client.on('spanStart', this._onSpanStart);
    client.on('spanEnd', this._onSpanEnd);
  }

  /**
   * Register a transaction as started. Starts stall tracking if not already running.
   */
  private _onSpanStart = (rootSpan: Span): void => {
    if (!isRootSpan(rootSpan)) {
      return;
    }

    if (this._statsByRootSpan.has(rootSpan)) {
      logger.error(
        '[StallTracking] Tried to start stall tracking on a transaction already being tracked. Measurements might be lost.',
      );
      return;
    }

    this._startTracking();
    this._statsByRootSpan.set(rootSpan, {
      longestStallTime: 0,
      atTimestamp: null,
      atStart: this._getCurrentStats(rootSpan),
    });
    this._flushLeakedTransactions();
  };

  /**
   * Logs a transaction as finished.
   * Stops stall tracking if no more transactions are running.
   * @returns The stall measurements
   */
  private _onSpanEnd = (rootSpan: Span): void => {
    if (!isRootSpan(rootSpan)) {
      return this._onChildSpanEnd(rootSpan);
    }

    const transactionStats = this._statsByRootSpan.get(rootSpan);

    if (!transactionStats) {
      // Transaction has been flushed out somehow, we return null.
      logger.log('[StallTracking] Stall measurements were not added to transaction due to exceeding the max count.');

      this._statsByRootSpan.delete(rootSpan);
      this._shouldStopTracking();

      return;
    }

    // The endTimestamp is always set, but type-wise it's optional
    // https://github.com/getsentry/sentry-javascript/blob/38bd57b0785c97c413f36f89ff931d927e469078/packages/core/src/tracing/sentrySpan.ts#L170
    const endTimestamp = spanToJSON(rootSpan).timestamp;

    let statsOnFinish: StallMeasurements | undefined;
    if (isNearToNow(endTimestamp)) {
      statsOnFinish = this._getCurrentStats(rootSpan);
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

    this._statsByRootSpan.delete(rootSpan);
    this._shouldStopTracking();

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

  /**
   * Marks stalls
   */
  private _onChildSpanEnd(childSpan: Span): void {
    const rootSpan = getRootSpan(childSpan);

    const finalEndTimestamp = spanToJSON(childSpan).timestamp;
    if (finalEndTimestamp) {
      this._markSpanFinish(rootSpan, finalEndTimestamp);
    }
  }

  /**
   * Switch that enables the iteraction once app moves from background to foreground.
   */
  private _backgroundEventListener(state: AppStateStatus): void {
    if (state === ('active' as AppStateStatus)) {
      this._isBackground = false;
      if (this._timeout != null) {
        this._lastIntervalMs = timestampInSeconds() * 1000;
        this._iteration();
      }
    } else {
      this._isBackground = true;
      this._timeout !== null && clearTimeout(this._timeout);
    }
  }

  /**
   * Logs the finish time of the span for use in `trimEnd: true` transactions.
   */
  private _markSpanFinish(rootSpan: Span, childSpanEndTime: number): void {
    const previousStats = this._statsByRootSpan.get(rootSpan);
    if (previousStats) {
      if (Math.abs(timestampInSeconds() - childSpanEndTime) > MARGIN_OF_ERROR_SECONDS) {
        logger.log(
          '[StallTracking] Span end not logged due to end timestamp being outside the margin of error from now.',
        );

        if (previousStats.atTimestamp && previousStats.atTimestamp.timestamp < childSpanEndTime) {
          // We also need to delete the stat for the last span, as the transaction would be trimmed to this span not the last one.
          this._statsByRootSpan.set(rootSpan, {
            ...previousStats,
            atTimestamp: null,
          });
        }
      } else {
        this._statsByRootSpan.set(rootSpan, {
          ...previousStats,
          atTimestamp: {
            timestamp: childSpanEndTime,
            stats: this._getCurrentStats(rootSpan),
          },
        });
      }
    }
  }

  /**
   * Get the current stats for a transaction at a given time.
   */
  private _getCurrentStats(span: Span): StallMeasurements {
    return {
      stall_count: { value: this._stallCount, unit: 'none' },
      stall_total_time: { value: this._totalStallTime, unit: 'millisecond' },
      stall_longest_time: {
        value: this._statsByRootSpan.get(span)?.longestStallTime ?? 0,
        unit: 'millisecond',
      },
    };
  }

  /**
   * Start tracking stalls
   */
  private _startTracking(): void {
    if (!this.isTracking) {
      this.isTracking = true;
      this._lastIntervalMs = Math.floor(timestampInSeconds() * 1000);

      this._iteration();
    }
  }

  /**
   * Stops the stall tracking interval and calls reset().
   */
  private _stopTracking(): void {
    this.isTracking = false;

    if (this._timeout !== null) {
      clearTimeout(this._timeout);
      this._timeout = null;
    }

    this._reset();
  }

  /**
   * Will stop tracking if there are no more transactions.
   */
  private _shouldStopTracking(): void {
    if (this._statsByRootSpan.size === 0) {
      this._stopTracking();
    }
  }

  /**
   * Clears all the collected stats
   */
  private _reset(): void {
    this._stallCount = 0;
    this._totalStallTime = 0;
    this._lastIntervalMs = 0;
    this._statsByRootSpan.clear();
  }

  /**
   * Iteration of the stall tracking interval. Measures how long the timer strayed from its expected time of running, and how
   * long the stall is for.
   */
  private _iteration(): void {
    const now = timestampInSeconds() * 1000;
    const totalTimeTaken = now - this._lastIntervalMs;

    if (totalTimeTaken >= LOOP_TIMEOUT_INTERVAL_MS + this._minimumStallThreshold) {
      const stallTime = totalTimeTaken - LOOP_TIMEOUT_INTERVAL_MS;
      this._stallCount += 1;
      this._totalStallTime += stallTime;

      for (const [transaction, value] of this._statsByRootSpan.entries()) {
        const longestStallTime = Math.max(value.longestStallTime ?? 0, stallTime);

        this._statsByRootSpan.set(transaction, {
          ...value,
          longestStallTime,
        });
      }
    }

    this._lastIntervalMs = now;

    if (this.isTracking && !this._isBackground) {
      this._timeout = setTimeout(this._iteration.bind(this), LOOP_TIMEOUT_INTERVAL_MS);
    }
  }

  /**
   * Deletes leaked transactions (Earliest transactions when we have more than MAX_RUNNING_TRANSACTIONS transactions.)
   */
  private _flushLeakedTransactions(): void {
    if (this._statsByRootSpan.size > MAX_RUNNING_TRANSACTIONS) {
      let counter = 0;
      const len = this._statsByRootSpan.size - MAX_RUNNING_TRANSACTIONS;
      const transactions = this._statsByRootSpan.keys();
      for (const t of transactions) {
        if (counter >= len) break;
        counter += 1;
        this._statsByRootSpan.delete(t);
      }
    }
  }
}
