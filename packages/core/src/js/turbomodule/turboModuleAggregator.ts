// Per-(module, method, kind) aggregation of TurboModule invocations. See
// https://github.com/getsentry/sentry-react-native/issues/6164 — one span per
// call would explode span counts on hot async paths, so instead we keep O(1)
// counters and flush at coarse-grained points (transaction finish, periodic timer).

import type { TurboModuleCallKind } from './turboModuleTracker';

export const HISTOGRAM_BUCKETS_MS: readonly number[] = [1, 5, 20, 100, 500];

export const HISTOGRAM_BUCKET_LABELS: readonly string[] = [
  'lt_1ms',
  'lt_5ms',
  'lt_20ms',
  'lt_100ms',
  'lt_500ms',
  'gte_500ms',
];

export interface TurboModuleAggregate {
  name: string;
  method: string;
  kind: TurboModuleCallKind;
  callCount: number;
  errorCount: number;
  totalDurationMs: number;
  maxDurationMs: number;
  /** Aligned with {@link HISTOGRAM_BUCKETS_MS}; final entry is the `>=500ms` overflow. */
  buckets: number[];
}

interface MutableAggregate extends TurboModuleAggregate {
  buckets: number[];
}

export interface TurboModuleRecord {
  name: string;
  method: string;
  kind: TurboModuleCallKind;
  durationMs: number;
  errored: boolean;
  recordId?: number;
}

export interface TurboModuleCallStart {
  recordId: number;
  name: string;
  method: string;
  kind: TurboModuleCallKind;
}

export type TurboModuleRecordObserver = (record: TurboModuleRecord) => void;
export type TurboModuleCallStartObserver = (start: TurboModuleCallStart) => void;

const aggregates = new Map<string, MutableAggregate>();
const ignoredModules = new Set<string>();
let onFirstRecordAfterEmpty: (() => void) | undefined;
const observers: Set<TurboModuleRecordObserver> = new Set();
const startObservers: Set<TurboModuleCallStartObserver> = new Set();
let nextRecordId = 0;
let recordingEnabled = true;

function makeKey(name: string, method: string, kind: TurboModuleCallKind): string {
  return `${name}|${method}|${kind}`;
}

function bucketIndexForDuration(durationMs: number): number {
  for (let i = 0; i < HISTOGRAM_BUCKETS_MS.length; i++) {
    const boundary = HISTOGRAM_BUCKETS_MS[i] ?? Infinity;
    if (durationMs < boundary) {
      return i;
    }
  }
  return HISTOGRAM_BUCKETS_MS.length;
}

export function setIgnoredTurboModules(names: ReadonlyArray<string> | undefined): void {
  ignoredModules.clear();
  if (!names) {
    return;
  }
  for (const name of names) {
    ignoredModules.add(name);
  }
}

// Must be O(1) — called on every wrapped call. Negative durations (push/pop clock skew)
// are clamped to zero so they still increment counters but don't poison totals.
export function recordTurboModuleCall(args: {
  name: string;
  method: string;
  kind: TurboModuleCallKind;
  durationMs: number;
  errored: boolean;
  recordId?: number;
}): void {
  if (ignoredModules.has(args.name)) {
    return;
  }

  const duration = args.durationMs > 0 ? args.durationMs : 0;

  if (recordingEnabled) {
    const wasEmpty = aggregates.size === 0;
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
    entry.buckets[bucket] = (entry.buckets[bucket] ?? 0) + 1;

    if (wasEmpty && onFirstRecordAfterEmpty) {
      try {
        onFirstRecordAfterEmpty();
      } catch {
        // swallowed
      }
    }
  }

  // Observers fire regardless of `recordingEnabled` — span attribution / slow-call
  // breadcrumbs still work when aggregate stats are opted out.
  if (observers.size > 0) {
    const record: TurboModuleRecord = {
      name: args.name,
      method: args.method,
      kind: args.kind,
      durationMs: duration,
      errored: args.errored,
      recordId: args.recordId,
    };
    for (const observer of observers) {
      try {
        observer(record);
      } catch {
        // one misbehaving observer must not drop records for others
      }
    }
  }
}

export function addTurboModuleRecordObserver(observer: TurboModuleRecordObserver): void {
  observers.add(observer);
}

export function removeTurboModuleRecordObserver(observer: TurboModuleRecordObserver): void {
  observers.delete(observer);
}

// Returns the `recordId` even for ignored modules so the wrap layer never has
// to branch — the paired record will be filtered out downstream.
export function notifyTurboModuleCallStart(name: string, method: string, kind: TurboModuleCallKind): number {
  const recordId = nextRecordId++;
  if (ignoredModules.has(name) || startObservers.size === 0) {
    return recordId;
  }
  const event: TurboModuleCallStart = { recordId, name, method, kind };
  for (const observer of startObservers) {
    try {
      observer(event);
    } catch {
      // one misbehaving observer must not drop the signal for others
    }
  }
  return recordId;
}

export function addTurboModuleCallStartObserver(observer: TurboModuleCallStartObserver): void {
  startObservers.add(observer);
}

export function removeTurboModuleCallStartObserver(observer: TurboModuleCallStartObserver): void {
  startObservers.delete(observer);
}

// Fires once when the aggregator transitions empty -> non-empty. Used to lazily
// arm the periodic flush so idle sessions don't churn timers.
export function setOnFirstTurboModuleRecord(cb: (() => void) | undefined): void {
  onFirstRecordAfterEmpty = cb;
}

export function setAggregateRecordingEnabled(enabled: boolean): void {
  recordingEnabled = enabled;
  if (!enabled) {
    aggregates.clear();
  }
}

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

export function hasTurboModuleAggregateData(): boolean {
  return aggregates.size > 0;
}

/** Tests only. */
export function _resetTurboModuleAggregator(): void {
  aggregates.clear();
  ignoredModules.clear();
  onFirstRecordAfterEmpty = undefined;
  observers.clear();
  startObservers.clear();
  nextRecordId = 0;
  recordingEnabled = true;
}
