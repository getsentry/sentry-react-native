import type { Scope, Session, Transport, UserFeedback } from '@sentry/core';

import {
  _INTERNAL_setSpanForScope,
  generateTraceId,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  rejectedSyncPromise,
} from '@sentry/core';

export type MockInterface<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer B ? jest.Mock<B, A> : T[K];
} & T;

export function mockFunction<T extends (...args: any[]) => any>(fn: T): jest.MockedFunction<T> {
  return fn as jest.MockedFunction<T>;
}

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

export const createMockTransport = (): MockInterface<Transport> => {
  return {
    send: jest.fn().mockResolvedValue(undefined),
    flush: jest.fn().mockResolvedValue(true),
  };
};

export const nowInSeconds = (): number => {
  return Date.now() / 1000;
};

export const secondAgoTimestampMs = (): number => {
  return new Date(Date.now() - 1000).getTime();
};

export const secondInFutureTimestampMs = (): number => {
  return new Date(Date.now() + 1000).getTime();
};

/**
 * Resets a single {@link Scope} to its pristine state.
 *
 * JS v11 removed `Scope.clear()` — MIGRATION.md advises re-initializing the SDK
 * or running code in a fresh scope via `withScope`/`withIsolationScope`, neither
 * of which fits the suite's shared `beforeEach` reset of the current, isolation
 * and global scopes. This mirrors exactly what the removed `clear()` reset:
 * breadcrumbs, tags, attributes, extra, user, contexts, level, transaction name,
 * fingerprint, session, conversation id, active span, attachments and the
 * propagation context. As in the original, the client and event processors are
 * intentionally left intact. Reaching into the `_`-prefixed fields is deliberate
 * and confined to test setup.
 */
export function resetScope(scope: Scope): void {
  const internal = scope as unknown as {
    _breadcrumbs: unknown[];
    _tags: Record<string, unknown>;
    _attributes: Record<string, unknown>;
    _extra: Record<string, unknown>;
    _user: Record<string, unknown>;
    _contexts: Record<string, unknown>;
    _level: unknown;
    _transactionName: unknown;
    _fingerprint: unknown;
    _session: unknown;
    _conversationId: unknown;
    _attachments: unknown[];
  };

  internal._breadcrumbs = [];
  internal._tags = {};
  internal._attributes = {};
  internal._extra = {};
  internal._user = {};
  internal._contexts = {};
  internal._level = undefined;
  internal._transactionName = undefined;
  internal._fingerprint = undefined;
  internal._session = undefined;
  internal._conversationId = undefined;
  internal._attachments = [];
  _INTERNAL_setSpanForScope(scope, undefined);
  scope.setPropagationContext({ traceId: generateTraceId(), sampleRand: Math.random() });
}

/**
 * Resets the current, isolation and global Sentry scopes to a pristine state
 * between tests. Drop-in replacement for the pre-v11
 * `getCurrentScope().clear(); getIsolationScope().clear(); getGlobalScope().clear();`
 * block that the suite relied on before `Scope.clear()` was removed.
 */
export function clearAllScopes(): void {
  resetScope(getCurrentScope());
  resetScope(getIsolationScope());
  resetScope(getGlobalScope());
}
