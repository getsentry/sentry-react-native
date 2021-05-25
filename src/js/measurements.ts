import { getMainCarrier, Hub } from "@sentry/hub";
import { Transaction } from "@sentry/tracing";
import { CustomSamplingContext, TransactionContext } from "@sentry/types";
import { logger, timestampInSeconds } from "@sentry/utils";

/**
 *
 */
export class Stalls {
  // private _acceptableBusyTime: number = 0;
  private _totalStallTime: number = 0;
  private _stallCount: number = 0;
  private _longestStall: number = 0;
  private _lastInterval: number = 0;

  private _timeout?: number;

  constructor() {
    // this._acceptableBusyTime = 16.667;

    this._lastInterval = timestampInSeconds() * 1000;
  }

  /**
   *
   */
  public start(): void {
    this._iteration();
  }

  /**
   *
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
   *
   */
  private _iteration(): void {
    const now = timestampInSeconds() * 1000;
    const busyTime = now - this._lastInterval;

    if (busyTime >= 80) {
      const stallTime = busyTime - 80;
      this._stallCount += 1;
      this._totalStallTime += stallTime;
      this._longestStall = Math.max(this._longestStall, stallTime);
    }

    this._lastInterval = now;
    this._timeout = setTimeout(this._iteration.bind(this), 40);
  }
}

/**
 *
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
 *
 */
const _patchStartTransaction = (
  originalStartTransaction: StartTransactionFunction
): StartTransactionFunction => {
  /**
   *
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
      if (
        typeof endTimestamp === "undefined" &&
        typeof transaction.endTimestamp === "undefined"
      ) {
        // We can only add stall metrics when the finish time is not manually set.
        const stallMeasurements = stalls.finish();
        transaction.setMeasurements(stallMeasurements);
      } else {
        logger.log("Stall metrics not added due to `endTimestamp` being set.");
      }

      return originalFinish.apply(transaction, [endTimestamp]);
    };

    return transaction;
  }

  return _startTransaction;
};
