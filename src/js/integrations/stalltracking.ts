/* eslint-disable max-lines */
import { Span, Transaction } from "@sentry/tracing";
import { Integration, Measurements } from "@sentry/types";
import { logger, timestampInSeconds } from "@sentry/utils";

export interface StallMeasurements extends Measurements {
  stall_count: { value: number };
  stall_total_time: { value: number };
  stall_longest_time: { value: number };
}

export type StallTrackingOptions = {
  /**
   * How long in milliseconds an event loop can stay "busy" for before being considered a stall.
   * @default 100
   */
  acceptableBusyTime: number;
};

/** Margin of error of 20ms */
const MARGIN_OF_ERROR_SECONDS = 0.02;
/** Max number of span stats stored */
const MAX_SPAN_STATS_LEN = 20;

/**
 * Stall measurement tracker
 */
export class StallTracking implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = "StallTracking";

  /**
   * @inheritDoc
   */
  public name: string = StallTracking.id;

  public isTracking: boolean = false;

  private _acceptableBusyTime: number;

  /** Total amount of time of all stalls that occurred during the current tracking session */
  private _totalStallTime: number = 0;
  /** Total number of stalls that occurred during the current tracking session */
  private _stallCount: number = 0;

  /** The last timestamp the iteration ran in seconds */
  private _lastInterval: number = 0;
  private _timeout: ReturnType<typeof setTimeout> | null = null;

  private _longestStallsByTransaction: Map<Transaction, number> = new Map();
  private _statsAtTimestamp: Map<
    Span,
    Map<NonNullable<Span["endTimestamp"]>, StallMeasurements>
  > = new Map();
  private _runningTransactions: Set<Transaction> = new Set();

  public constructor(
    options: StallTrackingOptions = { acceptableBusyTime: 100 }
  ) {
    this._acceptableBusyTime = options.acceptableBusyTime;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    // Do nothing.
  }

  /**
   * Register a transaction as started. Starts stall tracking if not already running.
   * @returns A finish method that returns the stall measurements.
   */
  public registerTransactionStart(
    transaction: Transaction
  ): (endTimestamp?: number) => StallMeasurements | null {
    if (this._runningTransactions.has(transaction)) {
      logger.error(
        "[StallTracking] Tried to start stall tracking on a transaction already being tracked. Measurements might be lost."
      );

      // noop
      return () => null;
    }

    this._startTracking();

    if (transaction.spanRecorder) {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const originalAdd = transaction.spanRecorder.add;

      transaction.spanRecorder.add = (span: Span): void => {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const originalSpanFinish = span.finish;

        span.finish = (endTimestamp?: number) => {
          // We let the span determine its own end timestamp as well in case anything gets changed upstream
          originalSpanFinish.apply(span, [endTimestamp]);

          // The span should set a timestamp, so this would be defined.
          if (span.endTimestamp) {
            this._logSpanFinish(transaction, span.endTimestamp);
          }
        };

        originalAdd.apply(transaction.spanRecorder, [span]);
      };
    }

    this._runningTransactions.add(transaction);
    this._longestStallsByTransaction.set(transaction, 0);
    this._statsAtTimestamp.set(transaction, new Map());

    const statsOnStart = this._getCurrentStats(transaction);

    return (endTimestamp?: number) =>
      this._onFinish(transaction, statsOnStart, endTimestamp);
  }

  /**
   * Logs a transaction as finished.
   * Stops stall tracking if no more transactions are running.
   * @returns The stall measurements
   */
  private _onFinish(
    transaction: Transaction,
    statsOnStart: StallMeasurements,
    passedEndTimestamp?: number
  ): StallMeasurements | null {
    const endTimestamp = passedEndTimestamp ?? transaction.endTimestamp;

    const statsOnFinish = endTimestamp
      ? this._findNearestSpanEnd(transaction, endTimestamp)
      : this._getCurrentStats(transaction);

    this._runningTransactions.delete(transaction);
    this._longestStallsByTransaction.delete(transaction);
    this._statsAtTimestamp.delete(transaction);

    if (this._runningTransactions.size === 0) {
      this._stopTracking();
    }

    if (!statsOnFinish) {
      if (typeof endTimestamp !== "undefined") {
        logger.log(
          "[StallTracking] Stall measurements not added due to `endTimestamp` being set to a value too far away from a logged point."
        );
      } else {
        logger.log(
          "[StallTracking] Stall measurements not added due to not being able to determine the end timestamp."
        );
      }

      return null;
    }

    return {
      stall_count: {
        value: statsOnFinish.stall_count.value - statsOnStart.stall_count.value,
      },
      stall_total_time: {
        value:
          statsOnFinish.stall_total_time.value -
          statsOnStart.stall_total_time.value,
      },
      stall_longest_time: statsOnFinish.stall_longest_time,
    };
  }

  /**
   * `spanEndTimestamp` needs to be in seconds!
   */
  private _logSpanFinish(
    transaction: Transaction,
    spanEndTimestamp: number
  ): void {
    const statsAtTimestampPerTransaction = this._statsAtTimestamp.get(
      transaction
    );

    if (statsAtTimestampPerTransaction) {
      if (
        Math.abs(timestampInSeconds() - spanEndTimestamp) >
        MARGIN_OF_ERROR_SECONDS
      ) {
        logger.log(
          "[StallTracking] Span end not logged due to end timestamp being outside the margin of error from now."
        );
      } else {
        statsAtTimestampPerTransaction.set(
          spanEndTimestamp,
          this._getCurrentStats(transaction)
        );
      }

      // We delete the first span (earliest timestamp) if there are greater than N span stats in the map.
      if (statsAtTimestampPerTransaction.size > MAX_SPAN_STATS_LEN) {
        const [key] = statsAtTimestampPerTransaction.keys();
        statsAtTimestampPerTransaction.delete(key);
      }
    }
  }

  /**
   * Allows us to support `trimEnd` and custom `endTimestamp` by finding the stats that we logged
   * at a span's finish time or the closest one within the margin of error.
   */
  private _findNearestSpanEnd(
    transaction: Transaction,
    endTimestamp: number
  ): StallMeasurements | null {
    const statsForTransaction = this._statsAtTimestamp.get(transaction);

    if (statsForTransaction) {
      const exactAtTimestamp = statsForTransaction.get(endTimestamp);

      if (exactAtTimestamp) {
        return exactAtTimestamp;
      }

      const statsWithinMargin = Array.from(
        statsForTransaction.entries()
      ).reduce(
        (
          statsWithinMargin: [number, StallMeasurements][],
          [timestamp, stats]
        ) => {
          const absErr = Math.abs(timestamp - endTimestamp);
          if (absErr < MARGIN_OF_ERROR_SECONDS) {
            return [
              ...statsWithinMargin,
              [absErr, stats] as [number, StallMeasurements],
            ];
          }
          return statsWithinMargin;
        },
        []
      );

      if (statsWithinMargin.length > 0) {
        const [err, stats] = statsWithinMargin.sort((a, b) => a[0] - b[0])[0];

        logger.log(
          `[StallTracking] Matched endTimestamp with a stat point within ${
            err * 1000
          }ms.`
        );

        return stats;
      }
    }

    return null;
  }

  /**
   * Get the current stats for a transaction at a given time.
   */
  private _getCurrentStats(transaction: Transaction): StallMeasurements {
    return {
      stall_count: { value: this._stallCount },
      stall_total_time: { value: this._totalStallTime },
      stall_longest_time: {
        value: this._longestStallsByTransaction.get(transaction) ?? 0,
      },
    };
  }

  /**
   * Start tracking stalls
   */
  private _startTracking(): void {
    if (!this.isTracking) {
      this.isTracking = true;
      this._lastInterval = timestampInSeconds() * 1000;

      this._iteration();
    }
  }

  /**
   * Stops the stall tracking interval.
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
   * Clears all the collected stats
   */
  private _reset(): void {
    this._stallCount = 0;
    this._totalStallTime = 0;
    this._lastInterval = 0;
    this._longestStallsByTransaction = new Map();
    this._runningTransactions = new Set();
  }

  /**
   * Iteration of the stall tracking interval. Measures how long the timer strayed from its expected time of running, and how
   * long the stall is for.
   */
  private _iteration(): void {
    const now = timestampInSeconds() * 1000;
    const totalTimeTaken = now - this._lastInterval;
    const timeoutDuration = this._acceptableBusyTime / 2;

    if (totalTimeTaken >= this._acceptableBusyTime) {
      const stallTime = totalTimeTaken - timeoutDuration;
      this._stallCount += 1;
      this._totalStallTime += stallTime;

      this._runningTransactions.forEach((transaction) => {
        this._longestStallsByTransaction.set(
          transaction,
          Math.max(
            this._longestStallsByTransaction.get(transaction) ?? 0,
            stallTime
          )
        );
      });
    }

    this._lastInterval = now;

    if (this.isTracking) {
      this._timeout = setTimeout(this._iteration.bind(this), timeoutDuration);
    }
  }
}
