import { Transaction } from '@sentry/tracing';

import { getBlankTransactionContext } from '../src/js/tracing/utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mockFunction<T extends (...args: any[]) => any>(
  fn: T
): jest.MockedFunction<T> {
  return fn as jest.MockedFunction<T>;
}

export const getMockTransaction = (name: string): Transaction => {
  const transaction = new Transaction(getBlankTransactionContext(name));

  // Assume it's sampled
  transaction.sampled = true;

  return transaction;
};
