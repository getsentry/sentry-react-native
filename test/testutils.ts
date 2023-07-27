import { Transaction } from '@sentry/core';
import type { Session, UserFeedback } from '@sentry/types';
import { rejectedSyncPromise } from '@sentry/utils';

import { getBlankTransactionContext } from '../src/js/tracing/utils';

export type MockInterface<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer B ? jest.Mock<B, A> : T[K];
} & T;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mockFunction<T extends (...args: any[]) => any>(fn: T): jest.MockedFunction<T> {
  return fn as jest.MockedFunction<T>;
}

export const getMockTransaction = (name: string): Transaction => {
  const transaction = new Transaction(getBlankTransactionContext(name));

  // Assume it's sampled
  transaction.sampled = true;

  return transaction;
};

export const firstArg = 0;
export const secondArg = 1;
export const envelopeHeader = 0;
export const envelopeItems = 1;
export const envelopeItemHeader = 0;
export const envelopeItemPayload = 1;

export const getMockSession = (): Session => ({
  sid: 'sid_test_value',
  init: true,
  timestamp: -1,
  started: -1,
  status: 'ok',
  errors: -1,
  ignoreDuration: false,
  release: 'release_test_value',
  toJSON: () => ({
    init: true,
    sid: 'sid_test_value',
    timestamp: 'timestamp_test_value',
    started: 'started_test_value',
    status: 'ok',
    errors: -1,
  }),
});

export const getMockUserFeedback = (): UserFeedback => ({
  comments: 'comments_test_value',
  email: 'email_test_value',
  name: 'name_test_value',
  event_id: 'event_id_test_value',
});

export const getSyncPromiseRejectOnFirstCall = <Y extends any[]>(reason: unknown): jest.Mock => {
  let shouldSyncReject = true;
  return jest.fn((..._args: Y) => {
    if (shouldSyncReject) {
      shouldSyncReject = false;
      return rejectedSyncPromise(reason);
    } else {
      return Promise.resolve();
    }
  });
};
