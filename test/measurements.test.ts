import { getCurrentHub,getMainCarrier } from '@sentry/core';

import { _addTracingExtensions, StartTransactionFunction } from '../src/js/measurements';

describe('Tracing extensions', () => {
  test('transaction has default op', async () => {
    _addTracingExtensions();
    const hub = getCurrentHub();
    const carrier = getMainCarrier();
    const startTransaction = carrier.__SENTRY__?.extensions?.startTransaction as StartTransactionFunction | undefined;

    const transaction = startTransaction?.apply(hub, [{}]);

    expect(transaction).toEqual(expect.objectContaining({ op: 'default' }));
  });

  test('transaction does not overwrite custom op', async () => {
    _addTracingExtensions();
    const hub = getCurrentHub();
    const carrier = getMainCarrier();
    const startTransaction = carrier.__SENTRY__?.extensions?.startTransaction as StartTransactionFunction | undefined;

    const transaction = startTransaction?.apply(hub, [{ op: 'custom' }]);

    expect(transaction).toEqual(expect.objectContaining({ op: 'custom' }));
  });
});
