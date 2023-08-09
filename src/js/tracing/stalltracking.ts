/* eslint-disable max-lines */
import type { IdleTransaction, Span, Transaction } from '@sentry/core';
import type { Measurements, MeasurementUnit } from '@sentry/types';
import { logger, timestampInSeconds } from '@sentry/utils';
import type { AppStateStatus } from 'react-native';
import { AppState } from 'react-native';

import { STALL_COUNT, STALL_LONGEST_TIME, STALL_TOTAL_TIME } from '../measurements';

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
export class StallTrackingInstrumentation {
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

  private _statsByTransaction: Map<
    Transaction,
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
   * Not used for this integration. Instead call `registerTransactionStart` to start tracking.
   */
  public setupOnce(): void {
    // Do nothing.
  }

  /**
   * Register a transaction as started. Starts stall tracking if not already running.
   * @returns A finish method that returns the stall measurements.
   */
  public onTransactionStart(transaction: Transaction): void {
    if (this._statsByTransaction.has(transaction)) {
      logger.error(
        '[StallTracking] Tried to start stall tracking on a transaction already being tracked. Measurements might be lost.',
      );

      return;
    }

    this._startTracking();
    this._statsByTransaction.set(transaction, {
      longestStallTime: 0,
      atTimestamp: null,
      atStart: this._getCurrentStats(transaction),
    });
    this._flushLeakedTransactions();

    if (transaction.spanRecorder) {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const originalAdd = transaction.spanRecorder.add;

      transaction.spanRecorder.add = (span: Span): void => {
        originalAdd.apply(transaction.spanRecorder, [span]);

        // eslint-disable-next-line @typescript-eslint/unbound-method
        const originalSpanFinish = span.finish;

        span.finish = (endTimestamp?: number) => {
          // We let the span determine its own end timestamp as well in case anything gets changed upstream
          originalSpanFinish.apply(span, [endTimestamp]);

          // The span should set a timestamp, so this would be defined.
          if (span.endTimestamp) {
            this._markSpanFinish(transaction, span.endTimestamp);
          }
        };
      };
    }
  }

  /**
   * Logs a transaction as finished.
   * Stops stall tracking if no more transactions are running.
   * @returns The stall measurements
   */
  public onTransactionFinish(transaction: Transaction | IdleTransaction, passedEndTimestamp?: number): void {
    const transactionStats = this._statsByTransaction.get(transaction);

    if (!transactionStats) {
      // Transaction has been flushed out somehow, we return null.
      logger.log('[StallTracking] Stall measurements were not added to transaction due to exceeding the max count.');

      this._statsByTransaction.delete(transaction);
      this._shouldStopTracking();

      return;
    }

    const endTimestamp = passedEndTimestamp ?? transaction.endTimestamp;

    const spans = transaction.spanRecorder ? transaction.spanRecorder.spans : [];
    const finishedSpanCount = spans.reduce((count, s) => (s !== transaction && s.endTimestamp ? count + 1 : count), 0);

    const trimEnd = transaction.toContext().trimEnd;
    const endWillBeTrimmed = trimEnd && finishedSpanCount > 0;

    /*
      This is not safe in the case that something changes upstream, but if we're planning to move this over to @sentry/javascript anyways,
      we can have this temporarily for now.
    */
    const isIdleTransaction = 'activities' in transaction;

    let statsOnFinish: StallMeasurements | undefined;
    if (endTimestamp && isIdleTransaction) {
      /*
        There is different behavior regarding child spans in a normal transaction and an idle transaction. In normal transactions,
        the child spans that aren't finished will be dumped, while in an idle transaction they're cancelled and finished.

        Note: `endTimestamp` will always be defined if this is called on an idle transaction finish. This is because we only instrument
        idle transactions inside `ReactNativeTracing`, which will pass an `endTimestamp`.
      */

      // There will be cancelled spans, which means that the end won't be trimmed
      const spansWillBeCancelled = spans.some(
        s => s !== transaction && s.startTimestamp < endTimestamp && !s.endTimestamp,
      );

      if (endWillBeTrimmed && !spansWillBeCancelled) {
        // the last span's timestamp will be used.

        if (transactionStats.atTimestamp) {
          statsOnFinish = transactionStats.atTimestamp.stats;
        }
      } else {
        // this endTimestamp will be used.
        statsOnFinish = this._getCurrentStats(transaction);
      }
    } else if (endWillBeTrimmed) {
      // If `trimEnd` is used, and there is a span to trim to. If there isn't, then the transaction should use `endTimestamp` or generate one.
      if (transactionStats.atTimestamp) {
        statsOnFinish = transactionStats.atTimestamp.stats;
      }
    } else if (!endTimestamp) {
      statsOnFinish = this._getCurrentStats(transaction);
    }

    this._statsByTransaction.delete(transaction);
    this._shouldStopTracking();

    if (!statsOnFinish) {
      if (typeof endTimestamp !== 'undefined') {
        logger.log('[StallTracking] Stall measurements not added due to `endTimestamp` being set.');
      } else if (trimEnd) {
        logger.log(
          '[StallTracking] Stall measurements not added due to `trimEnd` being set but we could not determine the stall measurements at that time.',
        );
      }

      return;
    }

    transaction.setMeasurement(
      STALL_COUNT,
      statsOnFinish.stall_count.value - transactionStats.atStart.stall_count.value,
      transactionStats.atStart.stall_count.unit,
    );

    transaction.setMeasurement(
      STALL_TOTAL_TIME,
      statsOnFinish.stall_total_time.value - transactionStats.atStart.stall_total_time.value,
      transactionStats.atStart.stall_total_time.unit,
    );

    transaction.setMeasurement(
      STALL_LONGEST_TIME,
      statsOnFinish.stall_longest_time.value,
      statsOnFinish.stall_longest_time.unit,
    );
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
  private _markSpanFinish(transaction: Transaction, spanEndTimestamp: number): void {
    const previousStats = this._statsByTransaction.get(transaction);
    if (previousStats) {
      if (Math.abs(timestampInSeconds() - spanEndTimestamp) > MARGIN_OF_ERROR_SECONDS) {
        logger.log(
          '[StallTracking] Span end not logged due to end timestamp being outside the margin of error from now.',
        );

        if (previousStats.atTimestamp && previousStats.atTimestamp.timestamp < spanEndTimestamp) {
          // We also need to delete the stat for the last span, as the transaction would be trimmed to this span not the last one.
          this._statsByTransaction.set(transaction, {
            ...previousStats,
            atTimestamp: null,
          });
        }
      } else {
        this._statsByTransaction.set(transaction, {
          ...previousStats,
          atTimestamp: {
            timestamp: spanEndTimestamp,
            stats: this._getCurrentStats(transaction),
          },
        });
      }
    }
  }

  /**
   * Get the current stats for a transaction at a given time.
   */
  private _getCurrentStats(transaction: Transaction): StallMeasurements {
    return {
      stall_count: { value: this._stallCount, unit: 'none' },
      stall_total_time: { value: this._totalStallTime, unit: 'millisecond' },
      stall_longest_time: {
        value: this._statsByTransaction.get(transaction)?.longestStallTime ?? 0,
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
    if (this._statsByTransaction.size === 0) {
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
    this._statsByTransaction.clear();
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

      for (const [transaction, value] of this._statsByTransaction.entries()) {
        const longestStallTime = Math.max(value.longestStallTime ?? 0, stallTime);

        this._statsByTransaction.set(transaction, {
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
    if (this._statsByTransaction.size > MAX_RUNNING_TRANSACTIONS) {
      let counter = 0;
      const len = this._statsByTransaction.size - MAX_RUNNING_TRANSACTIONS;
      const transactions = this._statsByTransaction.keys();
      for (const t of transactions) {
        if (counter >= len) break;
        counter += 1;
        this._statsByTransaction.delete(t);
      }
    }
  }
}
