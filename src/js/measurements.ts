import { getCurrentHub, getMainCarrier, Hub } from "@sentry/hub";
import { Transaction } from "@sentry/tracing";
import { CustomSamplingContext, TransactionContext } from "@sentry/types";
import { logger } from "@sentry/utils";

import { StallTracking } from "./integrations";

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

    const stallTracking = getCurrentHub().getIntegration(StallTracking);

    if (stallTracking) {
      if (!transactionContext.startTimestamp) {
        const finishStallTracking = stallTracking.registerTransactionStart(
          transaction
        );

        // eslint-disable-next-line @typescript-eslint/unbound-method
        const originalFinish = transaction.finish;

        transaction.finish = (endTimestamp: number | undefined) => {
          // Finish every time unless the stall intervals will keep going
          const stallMeasurements = finishStallTracking();

          if (stallMeasurements) {
            transaction.setMeasurements(stallMeasurements);
          }

          return originalFinish.apply(transaction, [endTimestamp]);
        };
      } else {
        logger.log(
          "[StallTracking] Stalls will not be tracked due to `startTimestamp` being set."
        );
      }
    }

    return transaction;
  }

  return _startTransaction;
};
