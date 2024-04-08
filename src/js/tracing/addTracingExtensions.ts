/**
 * Adds React Native's extensions. Needs to be called before any transactions are created.
 */
export function _addTracingExtensions(): void {
  // TODO: addTracingExtensions(); likely not needed in RN as it instruments global onerror and onunhandledrejections which are not use in RN
  // TODO: patch replacement of startTransaction -> use `spanStart` client event
  // const carrier = getMainCarrier();
  // if (carrier.__SENTRY__) {
  //   carrier.__SENTRY__.extensions = carrier.__SENTRY__.extensions || {};
  //   if (carrier.__SENTRY__.extensions.startTransaction) {
  //     const originalStartTransaction = carrier.__SENTRY__.extensions.startTransaction as StartTransactionFunction;
  //     /*
  //       Overwrites the transaction start and finish to start and finish stall tracking.
  //       Preferably instead of overwriting add a callback method for this in the Transaction itself.
  //     */
  //     const _startTransaction = _patchStartTransaction(originalStartTransaction);
  //     carrier.__SENTRY__.extensions.startTransaction = _startTransaction;
  //   }
  // }
}

// export type StartTransactionFunction = (
//   this: Hub,
//   transactionContext: TransactionContext,
//   customSamplingContext?: CustomSamplingContext,
// ) => Transaction;

// /**
//  * Overwrite the startTransaction extension method to start and end stall tracking.
//  */
// const _patchStartTransaction = (originalStartTransaction: StartTransactionFunction): StartTransactionFunction => {
//   /**
//    * Method to overwrite with
//    */
//   function _startTransaction(
//     this: Hub,
//     transactionContext: TransactionContext,
//     customSamplingContext?: CustomSamplingContext,
//   ): Transaction {
//     // Native SDKs require op to be set - for JS Relay sets `default`
//     if (!transactionContext.op) {
//       transactionContext.op = DEFAULT;
//     }

//     const transaction: Transaction = originalStartTransaction.apply(this, [transactionContext, customSamplingContext]);
//     const originalStartChild: Transaction['startChild'] = transaction.startChild.bind(transaction);
//     transaction.startChild = (
//       spanContext?: Pick<SpanContext, Exclude<keyof SpanContext, 'sampled' | 'traceId' | 'parentSpanId'>>,
//     ): SentrySpan => {
//       return originalStartChild({
//         ...spanContext,
//         // Native SDKs require op to be set
//         op: spanContext?.op || DEFAULT,
//       });
//     };

//     const reactNativeTracing = getCurrentHub().getIntegration(ReactNativeTracing);

//     if (reactNativeTracing) {
//       reactNativeTracing.onTransactionStart(transaction);

//       const originalFinish = transaction.end.bind(transaction);

//       transaction.end = (endTimestamp: number | undefined) => {
//         if (reactNativeTracing) {
//           reactNativeTracing.onTransactionFinish(transaction);
//         }

//         return originalFinish(endTimestamp);
//       };
//     }

//     return transaction;
//   }

//   return _startTransaction;
// };
