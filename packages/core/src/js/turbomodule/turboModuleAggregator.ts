/**
 * Per-(module, method, kind) aggregation of TurboModule invocations.
 *
 * The wrap layer in `wrapTurboModule` already measures each call's duration
 * and outcome. Sending one span per call would explode span counts on hot
 * async paths (every `RNSentry.captureEnvelope`, every JSI lookup, …) so
 * instead we keep O(1) per-key counters + a fixed-bucket histogram and flush
 * the aggregate at coarse-grained points (transaction finish, periodic timer).
 *
 * See https://github.com/getsentry/sentry-react-native/issues/6164.
 */

import type { TurboModuleCallKind } from './turboModuleTracker';

/** Upper-exclusive bucket boundaries in milliseconds, matching the issue. */
export const HISTOGRAM_BUCKETS_MS: readonly number[] = [1, 5, 20, 100, 500];

/** Suffixes used when serialising bucket counts (e.g. as span attributes). */
export const HISTOGRAM_BUCKET_LABELS: readonly string[] = [
  'lt_1ms',
  'lt_5ms',
  'lt_20ms',
  'lt_100ms',
  'lt_500ms',
  'gte_500ms',
];

/**
 * Aggregate counters for a single `(module, method, kind)` triplet.
 */
export interface TurboModuleAggregate {
  /** TurboModule name, e.g. `RNSentry`. */
  name: string;
  /** Method name, e.g. `captureEnvelope`. */
  method: string;
  /** Whether the invocation was `sync` (blocking) or `async` (returns a Promise). */
  kind: TurboModuleCallKind;
  /** Number of calls recorded since the last drain. */
  callCount: number;
  /** Number of calls that threw / rejected since the last drain. */
  errorCount: number;
  /** Sum of call durations in milliseconds since the last drain. */
  totalDurationMs: number;
  /** Largest single-call duration in milliseconds since the last drain. */
  maxDurationMs: number;
  /**
   * Per-bucket call counts, aligned with {@link HISTOGRAM_BUCKETS_MS}. The
   * final entry is the overflow bucket (`>=500ms`).
   */
  buckets: number[];
}

interface MutableAggregate extends TurboModuleAggregate {
  buckets: number[];
}

const aggregates = new Map<string, MutableAggregate>();
const ignoredModules = new Set<string>();
let onFirstRecordAfterEmpty: (() => void) | undefined;
// Non-zero disables the empty→non-empty callback. The periodic flush uses
// this to prevent the SDK's own transport call (which records itself into
// the aggregator) from re-arming the timer in an idle session.
let suppressFirstRecordCallbackDepth = 0;
// When `false`, `recordTurboModuleCall` is a no-op. The integration flips
// this off when `enableAggregateStats: false` so wrapped TurboModule calls
// don't accumulate into a map that nothing ever drains.
let recordingEnabled = true;

function makeKey(name: string, method: string, kind: TurboModuleCallKind): string {
  return `${name}|${method}|${kind}`;
}

function bucketIndexForDuration(durationMs: number): number {
  for (let i = 0; i < HISTOGRAM_BUCKETS_MS.length; i++) {
    // `i` is bounded by `.length`, so the read is in range — `?? Infinity`
    // is a noop at runtime but satisfies `noUncheckedIndexedAccess`.
    const boundary = HISTOGRAM_BUCKETS_MS[i] ?? Infinity;
    if (durationMs < boundary) {
      return i;
    }
  }
  return HISTOGRAM_BUCKETS_MS.length;
}

/**
 * Replaces the set of TurboModule names whose calls should NOT be aggregated.
 *
 * Per the issue, users may want to opt-out specific modules (e.g. `RNSentry`
 * itself, to keep the signal clean of SDK overhead). An empty list (default)
 * means every wrapped module is aggregated.
 */
export function setIgnoredTurboModules(names: ReadonlyArray<string> | undefined): void {
  ignoredModules.clear();
  if (!names) {
    return;
  }
  for (const name of names) {
    ignoredModules.add(name);
  }
}

/**
 * Returns whether the given TurboModule is currently opted out of aggregation.
 */
export function isTurboModuleIgnored(name: string): boolean {
  return ignoredModules.has(name);
}

/**
 * Records a single TurboModule method invocation into the aggregate.
 *
 * Must be O(1): called on every wrapped method invocation, including hot
 * async paths. Negative durations (a clock skew artefact between push/pop)
 * are clamped to zero so they still increment counters but don't poison
 * totals or buckets.
 */
export function recordTurboModuleCall(args: {
  name: string;
  method: string;
  kind: TurboModuleCallKind;
  durationMs: number;
  errored: boolean;
}): void {
  if (!recordingEnabled) {
    return;
  }
  if (ignoredModules.has(args.name)) {
    return;
  }

  const wasEmpty = aggregates.size === 0;
  const duration = args.durationMs > 0 ? args.durationMs : 0;
  const key = makeKey(args.name, args.method, args.kind);

  let entry = aggregates.get(key);
  if (!entry) {
    entry = {
      name: args.name,
      method: args.method,
      kind: args.kind,
      callCount: 0,
      errorCount: 0,
      totalDurationMs: 0,
      maxDurationMs: 0,
      buckets: new Array(HISTOGRAM_BUCKETS_MS.length + 1).fill(0) as number[],
    };
    aggregates.set(key, entry);
  }

  entry.callCount += 1;
  if (args.errored) {
    entry.errorCount += 1;
  }
  entry.totalDurationMs += duration;
  if (duration > entry.maxDurationMs) {
    entry.maxDurationMs = duration;
  }

  const bucket = bucketIndexForDuration(duration);
  // Bucket index is bounded by `bucketIndexForDuration`; `?? 0` here only
  // exists to satisfy `noUncheckedIndexedAccess`.
  entry.buckets[bucket] = (entry.buckets[bucket] ?? 0) + 1;

  if (wasEmpty && onFirstRecordAfterEmpty && suppressFirstRecordCallbackDepth === 0) {
    // Don't let a misbehaving observer corrupt the aggregate.
    try {
      onFirstRecordAfterEmpty();
    } catch {
      // intentionally swallowed
    }
  }
}

/**
 * Opens a suppression scope: while at least one is open, the empty→non-empty
 * callback registered via {@link setOnFirstTurboModuleRecord} is NOT invoked.
 * Records still land in the aggregate as normal.
 *
 * Used by the periodic flush to break a self-recursion loop: the flush's own
 * `captureEvent` call travels through `RNSentry.captureEnvelope`, which is a
 * wrapped TurboModule call and would otherwise re-arm the flush timer forever
 * in an otherwise-idle session.
 */
export function beginSuppressFirstTurboModuleRecordCallback(): void {
  suppressFirstRecordCallbackDepth += 1;
}

/**
 * Closes a suppression scope opened by
 * {@link beginSuppressFirstTurboModuleRecordCallback}. Idempotent at zero.
 */
export function endSuppressFirstTurboModuleRecordCallback(): void {
  if (suppressFirstRecordCallbackDepth > 0) {
    suppressFirstRecordCallbackDepth -= 1;
  }
}

/**
 * Registers a callback fired exactly once when the aggregator transitions
 * from empty to non-empty — i.e. when the first record after a drain (or
 * after init) lands. The integration uses this to lazily schedule a periodic
 * flush only when there's work to do, so idle sessions don't churn timers.
 *
 * Pass `undefined` to unregister.
 */
export function setOnFirstTurboModuleRecord(cb: (() => void) | undefined): void {
  onFirstRecordAfterEmpty = cb;
}

/**
 * Master switch for the aggregator. When disabled, `recordTurboModuleCall`
 * short-circuits and existing entries are cleared, so wrapped TurboModule
 * calls can't accumulate into a map that nothing ever drains (e.g. when the
 * integration was constructed with `enableAggregateStats: false`).
 *
 * Default: enabled.
 */
export function setAggregateRecordingEnabled(enabled: boolean): void {
  recordingEnabled = enabled;
  if (!enabled) {
    aggregates.clear();
  }
}

/**
 * Drains and returns the current aggregate, clearing the internal state.
 *
 * The returned array is a shallow copy: callers may freely mutate it (e.g.
 * to slice top-N) without affecting the next interval. `buckets` arrays on
 * each entry are also new instances.
 */
export function drainTurboModuleAggregate(): TurboModuleAggregate[] {
  if (aggregates.size === 0) {
    return [];
  }
  const out: TurboModuleAggregate[] = [];
  for (const entry of aggregates.values()) {
    out.push({
      name: entry.name,
      method: entry.method,
      kind: entry.kind,
      callCount: entry.callCount,
      errorCount: entry.errorCount,
      totalDurationMs: entry.totalDurationMs,
      maxDurationMs: entry.maxDurationMs,
      buckets: entry.buckets.slice(),
    });
  }
  aggregates.clear();
  return out;
}

/**
 * Returns whether the aggregator has anything to flush right now. Useful for
 * the periodic timer to skip a no-op send.
 */
export function hasTurboModuleAggregateData(): boolean {
  return aggregates.size > 0;
}

/**
 * Resets the aggregator. Tests only.
 */
export function _resetTurboModuleAggregator(): void {
  aggregates.clear();
  ignoredModules.clear();
  onFirstRecordAfterEmpty = undefined;
  suppressFirstRecordCallbackDepth = 0;
  recordingEnabled = true;
}
