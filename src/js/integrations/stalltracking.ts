import { Span, Transaction } from "@sentry/tracing";
import { Integration, Measurements } from "@sentry/types";
import { logger, timestampInSeconds } from "@sentry/utils";

interface StallMeasurements extends Measurements {
  stall_count: { value: number };
  stall_total_time: { value: number };
  stall_longest_time: { value: number };
}

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

  private _timeout?: number;
  private _runningTransactions: Transaction[] = [];
  private _isTracking: boolean = false;

  constructor(
    options: {
      /**
       * How long in milliseconds an event loop can stay "busy" for before being considered a stall.
       * @default 100
       */
      acceptableBusyTime: number;
    } = { acceptableBusyTime: 100 }
  ) {
    this._acceptableBusyTime = options.acceptableBusyTime;
  }

  /**
   * @inheritDoc
   */
  setupOnce(): void {
    // Do nothing.
  }

  /**
   * Register a transaction as started. Starts stall tracking if not already running.
   * @returns A finish method that returns the stall measurements.
   */
  public registerTransactionStart(
    transaction: Transaction
  ): () => StallMeasurements | void {
    if (
      this._runningTransactions.some((t) => t.spanId === transaction.spanId)
    ) {
      logger.error(
        "[StallTracking] Tried to start stall tracking on a transaction already being tracked. Measurements might be lost."
      );

      return () => {
        // noop
      };
    }

    this._startTracking();

    if (transaction.spanRecorder) {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const originalAdd = transaction.spanRecorder.add;

      transaction.spanRecorder.add = (span: Span): void => {
        const statsAtTimestampPerTransaction = this._statsAtTimestamp.get(
          transaction.spanId
        );

        if (statsAtTimestampPerTransaction && span.endTimestamp) {
          statsAtTimestampPerTransaction.set(
            span.endTimestamp,
            this._getCurrentStats(transaction.spanId)
          );
        }

        originalAdd.apply(transaction.spanRecorder, [span]);
      };
    }

    this._runningTransactions.push(transaction);
    this._longestStallsByTransaction.set(transaction.spanId, 0);

    const statsOnStart = this._getCurrentStats(transaction.spanId);

    return (endTimestamp?: number) =>
      this.onFinish(transaction, statsOnStart, endTimestamp);
  }

  /**
   * Logs a transaction as finished.
   * Stops stall tracking if no more transactions are running.
   * @returns The stall measurements
   */
  public onFinish(
    transaction: Transaction,
    statsOnStart: StallMeasurements,
    _endTimestamp?: number
  ): StallMeasurements | void {
    const endTimestamp = _endTimestamp ?? transaction.endTimestamp;

    const statsOnFinish = endTimestamp
      ? this._statsAtTimestamp.get(transaction.spanId)?.get(endTimestamp)
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
          "[StallTracking] Stall measurements not added due to `endTimestamp` being set."
        );
      } else {
        logger.log(
          "[StallTracking] Stall measurements not added due to not being able to determine the end timestamp."
        );
      }

      return;
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

    if (typeof this._timeout === "number") {
      clearTimeout(this._timeout);
    }
  }

  /**
   * Iteration of the stall tracking interval. Measures how long the timer strayed from its expected time of running, and how
   * long the stall is for.
   */
  private _iteration(): void {
    const now = timestampInSeconds() * 1000;
    const busyTime = now - this._lastInterval;

    if (busyTime >= this._acceptableBusyTime) {
      const stallTime = busyTime - this._acceptableBusyTime;
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
    this._timeout = setTimeout(
      this._iteration.bind(this),
      this._acceptableBusyTime / 5
    );
  }
}
