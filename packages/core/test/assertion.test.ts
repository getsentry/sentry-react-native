import { captureException } from '@sentry/core';

import { captureAssertionViolation } from '../src/js/assertion';

const mockScope = { setFingerprint: jest.fn() };

jest.mock('@sentry/core', () => {
  const actual = jest.requireActual('@sentry/core');
  return {
    ...actual,
    captureException: jest.fn(() => 'test-event-id'),
    withScope: jest.fn((callback: (scope: unknown) => unknown) => callback(mockScope)),
  };
});

describe('captureAssertionViolation', () => {
  beforeEach(() => {
    (captureException as jest.Mock).mockClear();
    mockScope.setFingerprint.mockClear();
  });

  test('reports a non-fatal handled event with the assertion mechanism', () => {
    captureAssertionViolation({ condition: 'total >= 0', values: { total: -4 } });

    expect(captureException).toHaveBeenCalledTimes(1);
    const [error, hint] = (captureException as jest.Mock).mock.calls[0];

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Assertion failed: total >= 0');

    expect(hint.mechanism).toEqual({
      type: 'assertion',
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
    expect(captureAssertionViolation({ condition: 'x' })).toBe('test-event-id');
  });

  test('records the pragma under mechanism.data with a uniform mechanism type', () => {
    captureAssertionViolation({ condition: 'x != null', pragma: 'assert' });

    const [, hint] = (captureException as jest.Mock).mock.calls[0];
    expect(hint.mechanism.type).toBe('assertion');
    expect(hint.mechanism.data.pragma).toBe('assert');
  });

  test('flattens boolean values without stringifying them', () => {
    captureAssertionViolation({ condition: 'isReady', values: { isReady: false, retries: 3 } });

    const [, hint] = (captureException as jest.Mock).mock.calls[0];
    expect(hint.mechanism.data['values.isReady']).toBe(false);
    expect(hint.mechanism.data['values.retries']).toBe('3');
  });

  test('supports a custom message and a caller-supplied error', () => {
    const error = new Error('boom');
    captureAssertionViolation({ message: 'custom', error });

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
    captureAssertionViolation({ condition: 'total >= 0', error });

    const [captured] = (captureException as jest.Mock).mock.calls[0];
    expect(captured).toBe(error);
    expect((captured as Error).message).toBe('Assertion failed: total >= 0');
  });

  test('groups by call site via a deterministic fingerprint', () => {
    captureAssertionViolation({
      condition: 'count > 0',
      pragma: 'console.assert',
      siteId: 'ErrorsScreen.tsx:105:0',
    });

    expect(mockScope.setFingerprint).toHaveBeenCalledWith([
      'sentry-assertion',
      'console.assert',
      'ErrorsScreen.tsx:105:0',
    ]);
  });

  test('falls back to the condition for the fingerprint when no siteId is present', () => {
    captureAssertionViolation({ condition: 'total >= 0' });

    expect(mockScope.setFingerprint).toHaveBeenCalledWith(['sentry-assertion', 'assertion', 'total >= 0']);
  });

  test('omits condition/values data when not provided', () => {
    captureAssertionViolation();

    const [error, hint] = (captureException as jest.Mock).mock.calls[0];
    expect((error as Error).message).toBe('Assertion failed');
    expect(hint.mechanism.data).toEqual({});
  });

  test('surfaces the siteId under mechanism.data', () => {
    captureAssertionViolation({ condition: 'x', siteId: 'Foo.tsx:10:2' });

    const [, hint] = (captureException as jest.Mock).mock.calls[0];
    expect(hint.mechanism.data.siteId).toBe('Foo.tsx:10:2');
  });

  test('reports each siteId at most once per session', () => {
    // Isolate the module registry so `reportedSites` starts empty regardless of
    // which siteIds other tests reported — the dedup set is module-level state.
    jest.isolateModules(() => {
      const { captureException: freshCapture } = require('@sentry/core');
      const { captureAssertionViolation: report } = require('../src/js/assertion');

      report({ condition: 'x', siteId: 'A.tsx:1:0' });
      const secondId = report({ condition: 'x', siteId: 'A.tsx:1:0' });

      // A different site is unaffected by the first site's dedup.
      report({ condition: 'y', siteId: 'B.tsx:2:0' });

      expect(freshCapture).toHaveBeenCalledTimes(2);
      // The deduped call reports nothing and returns an empty event id.
      expect(secondId).toBe('');
    });
  });

  test('reports on every call when once is false', () => {
    captureAssertionViolation({ condition: 'x', siteId: 'C.tsx:1:0', once: false });
    captureAssertionViolation({ condition: 'x', siteId: 'C.tsx:1:0', once: false });

    expect(captureException).toHaveBeenCalledTimes(2);
  });

  test('re-throws the error after reporting when rethrow is set', () => {
    const error = new Error('boom');
    expect(() => captureAssertionViolation({ condition: 'x', error, rethrow: true })).toThrow(error);

    expect(captureException).toHaveBeenCalledTimes(1);
    // Tagged so the runtime's global handler skips the re-thrown error instead of
    // reporting the same violation a second time as an unhandled crash.
    expect((error as { __sentry_captured__?: boolean }).__sentry_captured__).toBe(true);
  });

  test('does not throw when rethrow is not set (report-only pragmas)', () => {
    expect(() => captureAssertionViolation({ condition: 'x', pragma: 'warning' })).not.toThrow();
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  test('re-throws even when the report is deduplicated by siteId', () => {
    // Isolated so the first call is guaranteed to be this site's first sighting.
    jest.isolateModules(() => {
      const { captureException: freshCapture } = require('@sentry/core');
      const { captureAssertionViolation: report } = require('../src/js/assertion');

      const first = new Error('first');
      expect(() => report({ condition: 'x', error: first, siteId: 'R.tsx:1:0', rethrow: true })).toThrow(first);
      expect(freshCapture).toHaveBeenCalledTimes(1);

      const second = new Error('second');
      // Same site → the duplicate event is suppressed, but a violated precondition
      // must still halt control flow.
      expect(() => report({ condition: 'x', error: second, siteId: 'R.tsx:1:0', rethrow: true })).toThrow(second);
      expect(freshCapture).toHaveBeenCalledTimes(1);
      // The deduped rethrow is tagged too, so the global handler skips it — the
      // guard must hold on this branch, which returns before the tail rethrow.
      expect((second as { __sentry_captured__?: boolean }).__sentry_captured__).toBe(true);
    });
  });

  test('stringifies a Symbol value without throwing', () => {
    // `String(symbol)` throws a TypeError; the reporting path must never throw,
    // and the auto-captured `values` can hold a symbol when the condition
    // references a symbol-valued identifier.
    const sym = Symbol('token');
    expect(() => captureAssertionViolation({ condition: 'token', values: { token: sym } })).not.toThrow();

    const [, hint] = (captureException as jest.Mock).mock.calls[0];
    expect(hint.mechanism.data['values.token']).toBe('Symbol(token)');
  });

  test('falls back gracefully when a value throws on stringification', () => {
    const hostile = {
      toString() {
        throw new Error('nope');
      },
    };
    expect(() => captureAssertionViolation({ condition: 'x', values: { x: hostile } })).not.toThrow();

    const [, hint] = (captureException as jest.Mock).mock.calls[0];
    expect(hint.mechanism.data['values.x']).toBe('[unstringifiable object]');
  });

  test('does not throw when values is null', () => {
    // The public API can be called by hand with `values: null`; `Object.keys(null)`
    // would otherwise throw on the no-throw reporting path.
    expect(() => captureAssertionViolation({ condition: 'x', values: null as never })).not.toThrow();
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  test('does not throw when a value has a throwing getter', () => {
    const values = {};
    Object.defineProperty(values, 'boom', {
      enumerable: true,
      get() {
        throw new Error('nope');
      },
    });
    expect(() => captureAssertionViolation({ condition: 'x', values })).not.toThrow();

    const [, hint] = (captureException as jest.Mock).mock.calls[0];
    expect(hint.mechanism.data['values.boom']).toBe('[unreadable]');
  });

  test('interpolates messageArgs into the message format string', () => {
    // The variadic RN Dimensions invariant: `invariant(dims, '... %s', key)`.
    captureAssertionViolation({ message: 'No dimension set for key %s', messageArgs: ['window'] });

    const [error] = (captureException as jest.Mock).mock.calls[0];
    expect((error as Error).message).toBe('No dimension set for key window');
  });

  test('interpolates %d/%j and appends extra args, leaving a dangling specifier verbatim', () => {
    captureAssertionViolation({ message: 'n=%d obj=%j missing=%s', messageArgs: [3.9, { a: 1 }, 'x', 'y'] });

    const [error] = (captureException as jest.Mock).mock.calls[0];
    // %d truncates, %j serializes, the two consumed the first three args, the
    // trailing 'y' is appended, and the un-fed %s is left literal.
    expect((error as Error).message).toBe('n=3 obj={"a":1} missing=x y');
  });

  test('renders a non-coercible %d arg as NaN instead of throwing', () => {
    // `Number(symbol)` throws a TypeError; the numeric specifiers must not break
    // the no-throw reporting path.
    const sym = Symbol('x');
    expect(() => captureAssertionViolation({ message: 'id %d', messageArgs: [sym] })).not.toThrow();

    const [error] = (captureException as jest.Mock).mock.calls[0];
    expect((error as Error).message).toBe('id NaN');
  });

  test('caps oversized flattened values and the JSON snapshot', () => {
    const big = 'x'.repeat(5000);
    captureAssertionViolation({ condition: 'c', values: { big } });

    const [, hint] = (captureException as jest.Mock).mock.calls[0];
    const flattened = hint.mechanism.data['values.big'] as string;
    const snapshot = hint.mechanism.data.values as string;
    expect(flattened.length).toBeLessThanOrEqual(276);
    expect(flattened).toContain('…[truncated]');
    expect(snapshot.length).toBeLessThanOrEqual(1044);
    expect(snapshot).toContain('…[truncated]');
  });
});
