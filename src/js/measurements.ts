import { getMainCarrier, Hub } from "@sentry/hub";
import { Transaction } from "@sentry/tracing";
import { CustomSamplingContext, TransactionContext } from "@sentry/types";
import { logger, timestampInSeconds } from "@sentry/utils";

/**
 * Stall measurement tracker
 */
export class Stalls {
  private _acceptableBusyTime: number;

  private _totalStallTime: number = 0;
  private _stallCount: number = 0;
  private _longestStall: number = 0;
  private _lastInterval: number = 0;

  private _timeout?: number;

  constructor(
    options: {
      /** How long an event loop can stay "busy" for before being considered a stall. */
      acceptableBusyTime: number;
    } = { acceptableBusyTime: 100 }
  ) {
    this._acceptableBusyTime = options.acceptableBusyTime;
  }

  /**
   * Start tracking stalls
   */
  public start(): void {
    this._lastInterval = timestampInSeconds() * 1000;

    this._iteration();
  }

  /**
   * Stops the stall tracking interval, and returns the measurements
   */
  public finish(): {
    stall_count: { value: number };
    total_stall_time: { value: number };
    longest_stall: { value: number };
  } {
    if (typeof this._timeout === "number") {
      clearTimeout(this._timeout);
    }

    return {
      stall_count: { value: this._stallCount },
      total_stall_time: { value: this._totalStallTime },
      longest_stall: { value: this._longestStall },
    };
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
      this._longestStall = Math.max(this._longestStall, stallTime);
    }

    this._lastInterval = now;
    this._timeout = setTimeout(
      this._iteration.bind(this),
      this._acceptableBusyTime / 5
    );
  }
}

/**
 * Adds React Native's extensions. Needs to be called after @sentry/tracing's extension methods are added
 */
export function _addTracingExtensions(): void {
  const carrier = getMainCarrier();
  if (carrier.__SENTRY__) {
    carrier.__SENTRY__.extensions = carrier.__SENTRY__.extensions || {};
    if (carrier.__SENTRY__.extensions.startTransaction) {
      const originalStartTransaction = carrier.__SENTRY__.extensions
        .startTransaction as StartTransactionFunction;

      /*
        Overwrites the transaction start and finish to start and finish stall tracking.
        Preferably instead of overwriting add a callback method for this in the Transaction itself.
      */
      const _startTransaction = _patchStartTransaction(
        originalStartTransaction
      );

      carrier.__SENTRY__.extensions.startTransaction = _startTransaction;
    }
  }
}

type StartTransactionFunction = (
  this: Hub,
  transactionContext: TransactionContext,
  customSamplingContext?: CustomSamplingContext
) => Transaction;

/**
 * Overwrite the startTransaction extension method to start and end stall tracking.
 */
const _patchStartTransaction = (
  originalStartTransaction: StartTransactionFunction
): StartTransactionFunction => {
  /**
   * Method to overwrite with
   */
  function _startTransaction(
    this: Hub,
    transactionContext: TransactionContext,
    customSamplingContext?: CustomSamplingContext
  ): Transaction {
    const transaction: Transaction = originalStartTransaction.apply(this, [
      transactionContext,
      customSamplingContext,
    ]);

    const stalls = new Stalls();
    stalls.start();

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalFinish = transaction.finish;

    transaction.finish = (endTimestamp: number | undefined) => {
      // Finish every time unless the stall intervals will keep going
      const stallMeasurements = stalls.finish();

      if (
        typeof endTimestamp === "undefined" &&
        typeof transaction.endTimestamp === "undefined"
      ) {
        if (!transaction.toContext().trimEnd) {
          // We can only add stall metrics when the finish time is not manually set and the end is not trimmed.
          transaction.setMeasurements(stallMeasurements);
        } else {
          logger.log("Stall metrics not added due to `trimEnd` being true.");
        }
      } else {
        logger.log("Stall metrics not added due to `endTimestamp` being set.");
      }

      return originalFinish.apply(transaction, [endTimestamp]);
    };

    return transaction;
  }

  return _startTransaction;
};
