import { addNonEnumerableProperty, captureException, withScope } from '@sentry/core';

import { createSyntheticError, isErrorLike } from './utils/error';

/**
 * Mechanism type reported for every assertion violation.
 *
 * Uniform across all pragmas — the specific pragma (`invariant`, `assert`,
 * `warning`, `console.assert`, ...) is recorded under `mechanism.data.pragma`
 * instead, so violations can be filtered by flavor without fragmenting the
 * mechanism type. This is a de-facto (unregistered) mechanism type: Sentry
 * ingestion accepts arbitrary `mechanism.type` values and converts them to a
 * tag, so no backend or Relay registration is required. Violations render as
 * non-fatal, handled events with a full stack trace, breadcrumbs, and Session
 * Replay attached.
 */
export const DEFAULT_ASSERTION_MECHANISM = 'assertion';

export interface AssertionViolationOptions {
  /**
   * The source text of the assertion condition that failed, e.g. `"total >= 0"`.
   * Surfaced under `mechanism.data.condition` and used to build the default message.
   */
  condition?: string;
  /**
   * Runtime values that failed the assertion, e.g. `{ total: -4 }`.
   *
   * `mechanism.data` only accepts flat `string | boolean` values, so each entry
   * is flattened to `values.<key>` and stringified. The full object is also
   * preserved as a JSON snapshot under `values`.
   */
  values?: Record<string, unknown>;
  /**
   * The assertion pragma that produced this violation (`invariant`, `assert`,
   * `console.assert`, `warning`, ...). Recorded under `mechanism.data.pragma`
   * so violations can be filtered by the assertion flavor, while the mechanism
   * type stays the uniform `'assertion'` (`DEFAULT_ASSERTION_MECHANISM`). Only
   * added to `mechanism.data` when provided.
   */
  pragma?: string;
  /**
   * Human-readable message. Defaults to `Assertion failed: <condition>`. When
   * `messageArgs` are present, this is treated as a `util.format`-style template.
   */
  message?: string;
  /**
   * Substitution arguments for a variadic pragma (`invariant(cond, fmt, ...args)`,
   * `console.assert(cond, fmt, ...args)`). The Babel transform forwards the call's
   * arguments beyond the format string here so the `%s`/`%d`/`%o`/... specifiers
   * in `message` are interpolated instead of surfacing verbatim. Extra args with
   * no matching specifier are appended to the message.
   *
   * Evaluated only on the report (falsy) path, so their cost — and any side
   * effects — are deferred to an actual violation, consistent with the
   * `cond || report()` rewrite.
   */
  messageArgs?: unknown[];
  /**
   * An already-constructed error carrying the stack of the assertion call site.
   * The Babel transform passes a bare `new Error()` created at the call site so
   * the stack top is the assertion site itself (in dev and release); its
   * message is backfilled from `message`/`condition`. When omitted a synthetic
   * error is fabricated so a stack is captured without actually throwing.
   */
  error?: Error;
  /**
   * A stable identifier for the call site (e.g. `"ErrorsScreen.tsx:73:4"`),
   * injected by the Babel transform. When provided, the violation is reported
   * at most once per site per session to avoid flooding the issue stream from
   * an assertion inside a hot loop or a frequently re-rendered component.
   *
   * Pass `once: false` to opt out and report on every invocation.
   */
  siteId?: string;
  /**
   * Whether to deduplicate by `siteId`. Defaults to `true` when a `siteId` is
   * provided. Has no effect without a `siteId`.
   *
   * @default true
   */
  once?: boolean;
  /**
   * Re-throw the `error` after reporting, preserving the original throwing
   * semantics of hard preconditions (`invariant`, `assert`). The Babel transform
   * sets this for pragmas listed in its `rethrowPragmas`, so downstream code that
   * relied on the assertion halting execution is not reached with invalid state.
   *
   * The re-throw fires even when the report is deduplicated by `siteId` —
   * deduplication suppresses the duplicate *event*, never the control flow. To
   * avoid the rethrown error being reported a second time as an unhandled crash,
   * the reporter tags it so Sentry's global handler skips it.
   *
   * Report-only pragmas (`warning`, `console.assert`) leave this `false`.
   *
   * @default false
   */
  rethrow?: boolean;
}

/**
 * Call sites already reported this session, keyed by `siteId`. Kept module-level
 * so it persists for the lifetime of the JS runtime (i.e. the session).
 */
const reportedSites = new Set<string>();

/** Max length of a single flattened `values.<key>` string before truncation. */
const MAX_VALUE_LENGTH = 256;
/** Max length of the whole `values` JSON snapshot before truncation. */
const MAX_SNAPSHOT_LENGTH = 1024;
/** Max number of `values.<key>` entries emitted before the rest are dropped. */
const MAX_VALUE_ENTRIES = 50;

/** Truncates `text` to `max` characters, appending an ellipsis marker if cut. */
function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…[truncated]` : text;
}

/**
 * Coerces a single runtime value to a string for `mechanism.data`. Defensive on
 * purpose: `String(symbol)` throws a `TypeError`, and a value can carry a
 * throwing `toString`/`Symbol.toPrimitive`, so a naive `String(value)` would
 * crash the reporting path — exactly the path that must never throw. Symbols are
 * rendered via `.toString()`; anything else that throws falls back to its type.
 */
function stringifyValue(value: unknown): string {
  try {
    return typeof value === 'symbol' ? value.toString() : String(value);
  } catch (_e) {
    return `[unstringifiable ${typeof value}]`;
  }
}

/**
 * Interpolates a `console.assert`/`invariant`/`warning`-style format string with
 * its substitution arguments. These pragmas are variadic (`invariant(cond, fmt,
 * ...args)`); the Babel transform forwards the extra args as `messageArgs` so the
 * `%s`/`%d`/`%o`/... specifiers resolve instead of reaching Sentry verbatim.
 *
 * A pragmatic subset of the Node/browser `util.format` specifiers is supported.
 * Every substitution flows through `stringifyValue`, so interpolation inherits
 * the same no-throw guarantee. Args left over after the specifiers are consumed
 * are appended space-separated (matching `console.assert(cond, a, b)`); a
 * specifier with no remaining arg is left verbatim.
 */
function safeNumber(arg: unknown): number {
  try {
    return Number(arg);
  } catch (_e) {
    // `Number(symbol)` throws a TypeError; the reporting path must never throw,
    // so a non-coercible arg renders as `NaN` (matching `util.format`).
    return NaN;
  }
}

function formatMessage(template: string, args: unknown[]): string {
  let i = 0;
  const out = template.replace(/%[sdifjoOc%]/g, spec => {
    if (spec === '%%') {
      return '%';
    }
    if (spec === '%c') {
      i++; // CSS directive consumes an arg but renders nothing.
      return '';
    }
    if (i >= args.length) {
      return spec;
    }
    const arg = args[i++];
    switch (spec) {
      case '%d':
      case '%i':
        return String(Math.trunc(safeNumber(arg)));
      case '%f':
        return String(safeNumber(arg));
      case '%j':
        try {
          return JSON.stringify(arg) ?? 'undefined';
        } catch (_e) {
          return '[circular]';
        }
      default:
        // %s, %o, %O
        return stringifyValue(arg);
    }
  });
  const rest = args.slice(i).map(stringifyValue);
  return rest.length > 0 ? `${out} ${rest.join(' ')}` : out;
}

/**
 * Resolves the human-readable message: a caller `message` (interpolated with
 * `messageArgs` when present), else `Assertion failed: <condition>`, else the
 * bare fallback. A non-string `message` is coerced defensively.
 */
function buildMessage(message: unknown, messageArgs: unknown[] | undefined, condition: string | undefined): string {
  if (typeof message === 'string') {
    return messageArgs && messageArgs.length > 0 ? formatMessage(message, messageArgs) : message;
  }
  if (message !== undefined) {
    return stringifyValue(message);
  }
  return condition ? `Assertion failed: ${condition}` : 'Assertion failed';
}

/**
 * Re-throws `error` after tagging it as already reported. The tag
 * (`__sentry_captured__`) is the same non-enumerable marker `@sentry/core`
 * stamps in `checkOrSetAlreadyCaught`, so both `captureException` and — once it
 * honors the flag — React Native's ErrorUtils global handler skip it instead of
 * reporting the re-thrown error a second time as an unhandled crash. Set on
 * *every* rethrow path (including the dedup-suppressed branch, which never
 * reaches the tail) so the guard can never be bypassed.
 */
function rethrowCaptured(error: Error): never {
  addNonEnumerableProperty(error as unknown as Record<string, unknown>, '__sentry_captured__', true);
  throw error;
}

/**
 * Flattens a runtime values object into the flat `string | boolean` map that
 * `mechanism.data` accepts. Nested/complex values are stringified.
 *
 * Three bounds keep a large captured object from bloating the event payload or
 * burning CPU on the no-throw reporting path: the number of keys is capped
 * (`MAX_VALUE_ENTRIES`), each entry is length-capped (`MAX_VALUE_LENGTH`), and
 * the JSON snapshot — built from only the capped subset, never the full input —
 * is length-capped (`MAX_SNAPSHOT_LENGTH`). The Babel transform only ever emits
 * a handful of condition identifiers, but `captureAssertionViolation` is public
 * and can be handed an arbitrarily large object (e.g. a config or array with
 * millions of indices) by hand.
 */
function flattenValues(values: Record<string, unknown>): { [key: string]: string | boolean } {
  const data: { [key: string]: string | boolean } = {};
  const keys = Object.keys(values);
  const cappedKeys = keys.length > MAX_VALUE_ENTRIES ? keys.slice(0, MAX_VALUE_ENTRIES) : keys;
  // Only materialize a subset object when we actually truncated, so the common
  // (small) case snapshots the input directly with no extra allocation.
  const truncated = cappedKeys.length < keys.length;
  const snapshotSource: Record<string, unknown> = truncated ? {} : values;
  for (const key of cappedKeys) {
    try {
      const value = values[key];
      data[`values.${key}`] = typeof value === 'boolean' ? value : truncate(stringifyValue(value), MAX_VALUE_LENGTH);
      if (truncated) {
        snapshotSource[key] = value;
      }
    } catch (_e) {
      // A throwing getter must not break the no-throw reporting path.
      data[`values.${key}`] = '[unreadable]';
    }
  }
  if (truncated) {
    data['values.__truncated__'] = `${keys.length - cappedKeys.length} more keys omitted`;
  }
  try {
    data.values = truncate(JSON.stringify(snapshotSource) ?? 'undefined', MAX_SNAPSHOT_LENGTH);
  } catch (_e) {
    // Circular or non-serializable values — the flattened entries above still apply.
  }
  return data;
}

/**
 * Reports a violated assertion to Sentry as a non-fatal (handled) event without
 * throwing or crashing the app.
 *
 * This is the runtime target of the Sentry assertion Babel transform: the plugin
 * rewrites `invariant()` / `assert()` / `console.assert()` / `warning()` call
 * sites so that a falsy condition invokes this reporter instead of being
 * stripped from the release bundle.
 *
 * It can also be called by hand (Milestone 0) to de-risk the reporting path.
 *
 * @returns the id of the captured Sentry event.
 */
export function captureAssertionViolation(options: AssertionViolationOptions = {}): string {
  const { condition, values, pragma, siteId, once = true, rethrow = false } = options;

  const message = buildMessage(options.message, options.messageArgs, condition);

  const error = options.error ?? new Error(message);
  // The Babel transform creates a bare `new Error()` at the call site so its
  // stack top is the assertion site; backfill the readable message here, in the
  // one place that owns the default-message template. Guarded because the public
  // API is untyped at runtime: `error` can be a frozen object, carry a read-only
  // `message` accessor, or be a non-object primitive, any of which would throw a
  // `TypeError` on the assignment (in strict mode) — and this path must never
  // throw. If backfilling fails the caller's error rides along unchanged; the
  // message still reaches the event via `mechanism.data`/fingerprint.
  try {
    if (!error.message) {
      error.message = message;
    }
  } catch (_e) {
    // Read-only/frozen/non-object error — leave it as-is.
  }

  // Report each call site at most once per session unless the caller opts out.
  // Deduplication only suppresses the duplicate *event* — for a throwing pragma
  // the precondition is still violated, so control flow must still be halted.
  if (siteId !== undefined && once && reportedSites.has(siteId)) {
    if (rethrow) {
      rethrowCaptured(error);
    }
    return '';
  }
  if (siteId !== undefined && once) {
    reportedSites.add(siteId);
  }

  const data: { [key: string]: string | boolean } = {};
  if (pragma !== undefined) {
    data.pragma = pragma;
  }
  if (condition !== undefined) {
    data.condition = condition;
  }
  if (siteId !== undefined) {
    data.siteId = siteId;
  }
  // `!= null` (not `!== undefined`): a hand-written call can pass `values: null`,
  // and `flattenValues` → `Object.keys(null)` would throw on the no-throw path.
  if (values != null) {
    Object.assign(data, flattenValues(values));
  }

  const eventId = withScope(scope => {
    // Group deterministically by call site rather than by the runtime stack top.
    // For an inline assertion the top frame is a generic host frame (e.g. React
    // Native's Pressability internals) shared by every violation, so default
    // stack-based grouping would collapse unrelated assertions into one issue.
    // The build-time `siteId` is stable across dev and release; fall back to the
    // condition (then message) for hand-written calls that carry no `siteId`.
    scope.setFingerprint(['sentry-assertion', pragma ?? DEFAULT_ASSERTION_MECHANISM, siteId ?? condition ?? message]);

    return captureException(error, {
      // `synthetic: true` — the error was fabricated to carry a stack, not thrown.
      // `handled: true` — renders as a non-fatal in the issue stream.
      // `type` is the uniform assertion mechanism; the specific pragma lives in
      // `data.pragma`.
      mechanism: {
        type: DEFAULT_ASSERTION_MECHANISM,
        handled: true,
        synthetic: true,
        data,
      },
      // When the error carries no usable stack, attach a synthetic one so the
      // event still has a stack trace pointing near the call site.
      syntheticException: isErrorLike(error) ? undefined : createSyntheticError(),
    });
  });

  if (rethrow) {
    // Preserve the precondition's throwing semantics: re-throw after capturing so
    // downstream code that assumed the precondition held is not reached with
    // invalid state. `rethrowCaptured` tags the error so the global error handler
    // skips it — otherwise the same violation is reported twice (once handled
    // here, once as an unhandled crash).
    rethrowCaptured(error);
  }

  return eventId;
}
