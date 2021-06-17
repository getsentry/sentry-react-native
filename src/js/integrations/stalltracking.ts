/* eslint-disable max-lines */
import { IdleTransaction, Span, Transaction } from "@sentry/tracing";
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

  /** The last timestamp the iteration ran in milliseconds */
  private _lastIntervalMs: number = 0;
  private _timeout: ReturnType<typeof setTimeout> | null = null;

  private _longestStallsByTransaction: Map<Transaction, number> = new Map();
  private _statsAtTimestamp: Map<
    Transaction,
    { timestamp: number; stats: StallMeasurements }
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

    this._runningTransactions.add(transaction);
    this._longestStallsByTransaction.set(transaction, 0);

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
    transaction: Transaction | IdleTransaction,
    statsOnStart: StallMeasurements,
    passedEndTimestamp?: number
  ): StallMeasurements | null {
    const endTimestamp = passedEndTimestamp ?? transaction.endTimestamp;

    const spans = transaction.spanRecorder
      ? transaction.spanRecorder.spans
      : [];
    const finishedSpanCount = spans.reduce(
      (count, s) => (s !== transaction && s.endTimestamp ? count + 1 : count),
      0
    );

    const trimEnd = transaction.toContext().trimEnd;
    const endWillBeTrimmed = trimEnd && finishedSpanCount > 0;

    /*
      This is not safe in the case that something changes upstream, but if we're planning to move this over to @sentry/javascript anyways,
      we can have this temporarily for now.
    */
    const isIdleTransaction = "activities" in transaction;

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
        (s) =>
          s !== transaction &&
          s.startTimestamp < endTimestamp &&
          !s.endTimestamp
      );

      if (endWillBeTrimmed && !spansWillBeCancelled) {
        // the last span's timestamp will be used.
        const statsAtLastSpanFinish = this._statsAtTimestamp.get(transaction);

        if (statsAtLastSpanFinish) {
          statsOnFinish = statsAtLastSpanFinish.stats;
        }
      } else {
        // this endTimestamp will be used.
        statsOnFinish = this._getCurrentStats(transaction);
      }
    } else if (endWillBeTrimmed) {
      // If `trimEnd` is used, and there is a span to trim to. If there isn't, then the transaction should use `endTimestamp` or generate one.
      const statsAtLastSpanFinish = this._statsAtTimestamp.get(transaction);
      if (statsAtLastSpanFinish) {
        statsOnFinish = statsAtLastSpanFinish.stats;
      }
    } else if (!endTimestamp) {
      statsOnFinish = this._getCurrentStats(transaction);
    }

    this._runningTransactions.delete(transaction);
    this._longestStallsByTransaction.delete(transaction);
    this._statsAtTimestamp.delete(transaction);

    if (this._runningTransactions.size === 0) {
      // Stop tracking when there are no more transactions.
      this._stopTracking();
    }

    if (!statsOnFinish) {
      if (typeof endTimestamp !== "undefined") {
        logger.log(
          "[StallTracking] Stall measurements not added due to `endTimestamp` being set."
        );
      } else if (trimEnd) {
        logger.log(
          "[StallTracking] Stall measurements not added due to `trimEnd` being set but we could not determine the stall measurements at that time."
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
   * Logs the finish time of the span for use in `trimEnd: true` transactions.
   */
  private _markSpanFinish(
    transaction: Transaction,
    spanEndTimestamp: number
  ): void {
    if (
      Math.abs(timestampInSeconds() - spanEndTimestamp) >
      MARGIN_OF_ERROR_SECONDS
    ) {
      logger.log(
        "[StallTracking] Span end not logged due to end timestamp being outside the margin of error from now."
      );

      const previousStats = this._statsAtTimestamp.get(transaction);

      if (previousStats && previousStats.timestamp < spanEndTimestamp) {
        // We also need to delete the stat for the last span, as the transaction would be trimmed to this span not the last one.
        this._statsAtTimestamp.delete(transaction);
      }
    } else {
      this._statsAtTimestamp.set(transaction, {
        timestamp: spanEndTimestamp,
        stats: this._getCurrentStats(transaction),
      });
    }
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
   * Clears all the collected stats
   */
  private _reset(): void {
    this._stallCount = 0;
    this._totalStallTime = 0;
    this._lastIntervalMs = 0;
    this._longestStallsByTransaction.clear();
    this._runningTransactions.clear();
    this._statsAtTimestamp.clear();
  }

  /**
   * Iteration of the stall tracking interval. Measures how long the timer strayed from its expected time of running, and how
   * long the stall is for.
   */
  private _iteration(): void {
    const now = timestampInSeconds() * 1000;
    const totalTimeTaken = now - this._lastIntervalMs;

    const timeoutDuration = this._acceptableBusyTime / 2;

    if (totalTimeTaken >= this._acceptableBusyTime) {
      const stallTime = totalTimeTaken - timeoutDuration;
      this._stallCount += 1;
      this._totalStallTime += stallTime;

      this._runningTransactions.forEach((transaction) => {
        const longestStall = Math.max(
          this._longestStallsByTransaction.get(transaction) ?? 0,
          stallTime
        );

        this._longestStallsByTransaction.set(transaction, longestStall);
      });
    }

    this._lastIntervalMs = now;

    if (this.isTracking) {
      this._timeout = setTimeout(this._iteration.bind(this), timeoutDuration);
    }
  }
}
