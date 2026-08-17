import { captureException } from '@sentry/core';

import { captureInvariantViolation } from '../src/js/invariant';

const mockScope = { setFingerprint: jest.fn() };

jest.mock('@sentry/core', () => {
  const actual = jest.requireActual('@sentry/core');
  return {
    ...actual,
    captureException: jest.fn(() => 'test-event-id'),
    withScope: jest.fn((callback: (scope: unknown) => unknown) => callback(mockScope)),
  };
});

describe('captureInvariantViolation', () => {
  beforeEach(() => {
    (captureException as jest.Mock).mockClear();
    mockScope.setFingerprint.mockClear();
  });

  test('reports a non-fatal handled event with the invariant mechanism', () => {
    captureInvariantViolation({ condition: 'total >= 0', values: { total: -4 } });

    expect(captureException).toHaveBeenCalledTimes(1);
    const [error, hint] = (captureException as jest.Mock).mock.calls[0];

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Invariant violated: total >= 0');

    expect(hint.mechanism).toEqual({
      type: 'invariant',
      handled: true,
      synthetic: true,
      data: {
        condition: 'total >= 0',
        'values.total': '-4',
        values: JSON.stringify({ total: -4 }),
      },
    });
  });

  test('returns the captured event id', () => {
    expect(captureInvariantViolation({ condition: 'x' })).toBe('test-event-id');
  });

  test('uses the pragma as the mechanism type', () => {
    captureInvariantViolation({ condition: 'x != null', pragma: 'assert' });

    const [, hint] = (captureException as jest.Mock).mock.calls[0];
    expect(hint.mechanism.type).toBe('assert');
  });

  test('flattens boolean values without stringifying them', () => {
    captureInvariantViolation({ condition: 'isReady', values: { isReady: false, retries: 3 } });

    const [, hint] = (captureException as jest.Mock).mock.calls[0];
    expect(hint.mechanism.data['values.isReady']).toBe(false);
    expect(hint.mechanism.data['values.retries']).toBe('3');
  });

  test('supports a custom message and a caller-supplied error', () => {
    const error = new Error('boom');
    captureInvariantViolation({ message: 'custom', error });

    const [captured, hint] = (captureException as jest.Mock).mock.calls[0];
    expect(captured).toBe(error);
    expect(hint.mechanism.synthetic).toBe(true);
    // An error-like value carries its own stack, so no synthetic exception is attached.
    expect(hint.syntheticException).toBeUndefined();
  });

  test('backfills the message on a caller-supplied error that has none', () => {
    // The Babel transform passes a bare `new Error()` created at the call site;
    // its stack is kept, but the readable message is filled in by the reporter.
    const error = new Error();
    captureInvariantViolation({ condition: 'total >= 0', error });

    const [captured] = (captureException as jest.Mock).mock.calls[0];
    expect(captured).toBe(error);
    expect((captured as Error).message).toBe('Invariant violated: total >= 0');
  });

  test('groups by call site via a deterministic fingerprint', () => {
    captureInvariantViolation({
      condition: 'count > 0',
      pragma: 'console.assert',
      siteId: 'ErrorsScreen.tsx:105:0',
    });

    expect(mockScope.setFingerprint).toHaveBeenCalledWith([
      'loud-invariant',
      'console.assert',
      'ErrorsScreen.tsx:105:0',
    ]);
  });

  test('falls back to the condition for the fingerprint when no siteId is present', () => {
    captureInvariantViolation({ condition: 'total >= 0' });

    expect(mockScope.setFingerprint).toHaveBeenCalledWith(['loud-invariant', 'invariant', 'total >= 0']);
  });

  test('omits condition/values data when not provided', () => {
    captureInvariantViolation();

    const [error, hint] = (captureException as jest.Mock).mock.calls[0];
    expect((error as Error).message).toBe('Invariant violated');
    expect(hint.mechanism.data).toEqual({});
  });

  test('surfaces the siteId under mechanism.data', () => {
    captureInvariantViolation({ condition: 'x', siteId: 'Foo.tsx:10:2' });

    const [, hint] = (captureException as jest.Mock).mock.calls[0];
    expect(hint.mechanism.data.siteId).toBe('Foo.tsx:10:2');
  });

  test('reports each siteId at most once per session', () => {
    captureInvariantViolation({ condition: 'x', siteId: 'A.tsx:1:0' });
    const secondId = captureInvariantViolation({ condition: 'x', siteId: 'A.tsx:1:0' });

    // A different site is unaffected by the first site's dedup.
    captureInvariantViolation({ condition: 'y', siteId: 'B.tsx:2:0' });

    expect(captureException).toHaveBeenCalledTimes(2);
    // The deduped call reports nothing and returns an empty event id.
    expect(secondId).toBe('');
  });

  test('reports on every call when once is false', () => {
    captureInvariantViolation({ condition: 'x', siteId: 'C.tsx:1:0', once: false });
    captureInvariantViolation({ condition: 'x', siteId: 'C.tsx:1:0', once: false });

    expect(captureException).toHaveBeenCalledTimes(2);
  });

  test('re-throws the error after reporting when rethrow is set', () => {
    const error = new Error('boom');
    expect(() => captureInvariantViolation({ condition: 'x', error, rethrow: true })).toThrow(error);

    expect(captureException).toHaveBeenCalledTimes(1);
    // Tagged so the runtime's global handler skips the re-thrown error instead of
    // reporting the same violation a second time as an unhandled crash.
    expect((error as { __sentry_captured__?: boolean }).__sentry_captured__).toBe(true);
  });

  test('does not throw when rethrow is not set (report-only pragmas)', () => {
    expect(() => captureInvariantViolation({ condition: 'x', pragma: 'warning' })).not.toThrow();
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  test('re-throws even when the report is deduplicated by siteId', () => {
    const first = new Error('first');
    expect(() =>
      captureInvariantViolation({ condition: 'x', error: first, siteId: 'R.tsx:1:0', rethrow: true }),
    ).toThrow(first);
    expect(captureException).toHaveBeenCalledTimes(1);

    const second = new Error('second');
    // Same site → the duplicate event is suppressed, but a violated precondition
    // must still halt control flow.
    expect(() =>
      captureInvariantViolation({ condition: 'x', error: second, siteId: 'R.tsx:1:0', rethrow: true }),
    ).toThrow(second);
    expect(captureException).toHaveBeenCalledTimes(1);
    // The deduped rethrow is tagged too, so the global handler skips it — the
    // guard must hold on this branch, which returns before the tail rethrow.
    expect((second as { __sentry_captured__?: boolean }).__sentry_captured__).toBe(true);
  });

  test('caps oversized flattened values and the JSON snapshot', () => {
    const big = 'x'.repeat(5000);
    captureInvariantViolation({ condition: 'c', values: { big } });

    const [, hint] = (captureException as jest.Mock).mock.calls[0];
    const flattened = hint.mechanism.data['values.big'] as string;
    const snapshot = hint.mechanism.data.values as string;
    expect(flattened.length).toBeLessThanOrEqual(276);
    expect(flattened).toContain('…[truncated]');
    expect(snapshot.length).toBeLessThanOrEqual(1044);
    expect(snapshot).toContain('…[truncated]');
  });
});
