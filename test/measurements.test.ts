import type { Carrier, Transaction } from '@sentry/core';
import { getCurrentHub, getMainCarrier } from '@sentry/core';
import type { Hub } from '@sentry/types';

import type { StartTransactionFunction } from '../src/js/measurements';
import { _addTracingExtensions } from '../src/js/measurements';

describe('Tracing extensions', () => {
  let hub: Hub;
  let carrier: Carrier;
  let startTransaction: StartTransactionFunction | undefined;

  beforeEach(() => {
    _addTracingExtensions();
    hub = getCurrentHub();
    carrier = getMainCarrier();
    startTransaction = carrier.__SENTRY__?.extensions?.startTransaction as StartTransactionFunction | undefined;
  });

  test('transaction has default op', async () => {
    const transaction: Transaction = startTransaction?.apply(hub, [{}]);

    expect(transaction).toEqual(expect.objectContaining({ op: 'default' }));
  });

  test('transaction does not overwrite custom op', async () => {
    const transaction: Transaction = startTransaction?.apply(hub, [{ op: 'custom' }]);

    expect(transaction).toEqual(expect.objectContaining({ op: 'custom' }));
  });

  test('transaction start span creates default op', async () => {
    const transaction: Transaction = startTransaction?.apply(hub, [{ op: 'custom' }]);
    const span = transaction?.startChild();

    expect(span).toEqual(expect.objectContaining({ op: 'default' }));
  });

  test('transaction start span keeps custom op', async () => {
    const transaction: Transaction = startTransaction?.apply(hub, [{ op: 'custom' }]);
    const span = transaction?.startChild({ op: 'custom' });

    expect(span).toEqual(expect.objectContaining({ op: 'custom' }));
  });

  test('transaction start span passes correct values to the child', async () => {
    const transaction: Transaction = startTransaction?.apply(hub, [{ op: 'custom' }]);
    const span = transaction?.startChild({ op: 'custom' });

    expect(span).toEqual(
      expect.objectContaining({
        transaction,
        parentSpanId: transaction.spanId,
        sampled: transaction.sampled,
        traceId: transaction.traceId,
      }),
    );
  });
});
