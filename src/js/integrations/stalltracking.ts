/* eslint-disable max-lines */
import { Span, Transaction } from "@sentry/tracing";
import { Integration, Measurements } from "@sentry/types";
import { logger, timestampInSeconds } from "@sentry/utils";

export interface StallMeasurements extends Measurements {
  stall_count: { value: number };
  stall_total_time: { value: number };
  stall_longest_time: { value: number };
}

/** Margin of error of 20ms */
const MARGIN_OF_ERROR_SECONDS = 0.02;
/** Max number of span stats stored */
const MAX_SPAN_STATS_LEN = 20;

/**
 * Ensures the timestamp is in seconds. This is because the endTimestamp
 * passed to .finish() could be seconds or milliseconds.
 */
const standardizeTimestampToSeconds = (timestamp: number): number =>
  new Date(timestamp).getTime() / 1000;

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

  private _acceptableBusyTime: number;

  private _totalStallTime: number = 0;
  private _stallCount: number = 0;
  private _lastInterval: number = 0;
  private _longestStallsByTransaction: Map<string, number> = new Map();
  private _statsAtTimestamp: Map<
    string,
    Map<number, StallMeasurements>
  > = new Map();

  private _timeout: ReturnType<typeof setTimeout> | null;
  private _runningTransactions: Transaction[] = [];
  private _isTracking: boolean = false;

  public constructor(
    options: {
      /**
       * How long in milliseconds an event loop can stay "busy" for before being considered a stall.
       * @default 100
       */
      acceptableBusyTime: number;
    } = { acceptableBusyTime: 100 }
  ) {
    this._acceptableBusyTime = options.acceptableBusyTime;
    this._timeout = null;
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
    if (
      this._runningTransactions.some((t) => t.spanId === transaction.spanId)
    ) {
      logger.error(
        "[StallTracking] Tried to start stall tracking on a transaction already being tracked. Measurements might be lost."
      );

      return () => {
        // noop
        return null;
      };
    }

    this._startTracking();

    if (transaction.spanRecorder) {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const originalAdd = transaction.spanRecorder.add;

      transaction.spanRecorder.add = (span: Span): void => {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const originalSpanFinish = span.finish;

        span.finish = (_endTimestamp?: number) => {
          // Sanitize the span endTimestamp to always be seconds as it could be set with milliseconds.
          const endTimestamp = _endTimestamp
            ? standardizeTimestampToSeconds(_endTimestamp)
            : undefined;

          // We let the span determine its own end timestamp as well in case anything gets changed upstream
          originalSpanFinish.apply(span, [endTimestamp]);

          // The span should set a timestamp, so this would be defined.
          if (span.endTimestamp) {
            this._logSpanFinish(transaction.spanId, span.endTimestamp);
          }
        };

        originalAdd.apply(transaction.spanRecorder, [span]);
      };
    }

    this._runningTransactions.push(transaction);
    this._longestStallsByTransaction.set(transaction.spanId, 0);
    this._statsAtTimestamp.set(transaction.spanId, new Map());

    const statsOnStart = this._getCurrentStats(transaction.spanId);

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
    const _endTimestamp = passedEndTimestamp ?? transaction.endTimestamp;
    const endTimestamp = _endTimestamp
      ? standardizeTimestampToSeconds(_endTimestamp)
      : undefined;

    const statsOnFinish = endTimestamp
      ? this._findNearestSpanEnd(transaction.spanId, endTimestamp)
      : this._getCurrentStats(transaction.spanId);

    this._runningTransactions = this._runningTransactions.filter(
      (t) => t.spanId !== transaction.spanId
    );
    this._longestStallsByTransaction.delete(transaction.spanId);
    this._statsAtTimestamp.delete(transaction.spanId);

    if (this._runningTransactions.length === 0) {
      this._stopTracking();
    }

    if (!statsOnFinish) {
      if (typeof _endTimestamp !== "undefined") {
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
    transactionId: string,
    spanEndTimestamp: number
  ): void {
    const statsAtTimestampPerTransaction = this._statsAtTimestamp.get(
      transactionId
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
          this._getCurrentStats(transactionId)
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
    transactionId: string,
    endTimestamp: number
  ): StallMeasurements | null {
    const statsForTransaction = this._statsAtTimestamp.get(transactionId);

    if (statsForTransaction) {
      const exactAtTimestamp = statsForTransaction.get(endTimestamp);

      if (exactAtTimestamp) {
        return exactAtTimestamp;
      }

      const statsWithinMargin: [number, StallMeasurements][] = [];
      for (const [timestamp, stats] of statsForTransaction.entries()) {
        const absErr = Math.abs(timestamp - endTimestamp);
        if (absErr < MARGIN_OF_ERROR_SECONDS) {
          statsWithinMargin.push([absErr, stats]);
        }
      }

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
  private _getCurrentStats(transactionId: string): StallMeasurements {
    return {
      stall_count: { value: this._stallCount },
      stall_total_time: { value: this._totalStallTime },
      stall_longest_time: {
        value: this._longestStallsByTransaction.get(transactionId) ?? 0,
      },
    };
  }

  /**
   * Start tracking stalls
   */
  private _startTracking(): void {
    if (!this._isTracking) {
      this._isTracking = true;
      this._lastInterval = timestampInSeconds() * 1000;

      this._iteration();
    }
  }

  /**
   * Stops the stall tracking interval, and returns the measurements
   */
  private _stopTracking(): void {
    this._isTracking = false;

    if (this._timeout !== null) {
      clearTimeout(this._timeout);
      this._timeout = null;
    }
  }

  /**
   * Iteration of the stall tracking interval. Measures how long the timer strayed from its expected time of running, and how
   * long the stall is for.
   */
  private _iteration(): void {
    const now = timestampInSeconds() * 1000;
    const busyTime = now - this._lastInterval;
    const timeoutDuration = this._acceptableBusyTime / 2;

    if (busyTime >= this._acceptableBusyTime) {
      const stallTime = busyTime - timeoutDuration;
      this._stallCount += 1;
      this._totalStallTime += stallTime;

      this._runningTransactions.forEach((transaction) => {
        this._longestStallsByTransaction.set(
          transaction.spanId,
          Math.max(
            this._longestStallsByTransaction.get(transaction.spanId) ?? 0,
            stallTime
          )
        );
      });
    }

    this._lastInterval = now;
    this._timeout = setTimeout(this._iteration.bind(this), timeoutDuration);
  }
}
