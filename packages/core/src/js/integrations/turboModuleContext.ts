import type { Client, Event, Integration, TransactionEvent } from '@sentry/core';

import { debug } from '@sentry/core';

import { createSpanJSON } from '../tracing/utils';
import {
  drainTurboModuleAggregate,
  HISTOGRAM_BUCKET_LABELS,
  hasTurboModuleAggregateData,
  setIgnoredTurboModules,
  setOnFirstTurboModuleRecord,
  type TurboModuleAggregate,
  wrapTurboModule,
} from '../turbomodule';
import { getRNSentryModule } from '../wrapper';

export const INTEGRATION_NAME = 'TurboModuleContext';

/** Op for the synthetic child span that carries the aggregate breakdown. */
export const TURBO_MODULES_AGGREGATE_OP = 'turbo_modules.aggregate';

/** Origin string set on the aggregate span so it shows up as auto-instrumented. */
export const TURBO_MODULES_AGGREGATE_ORIGIN = 'auto.tracing.turbo_modules';

/** Default flush cadence for the periodic timer, in milliseconds. */
export const DEFAULT_AGGREGATE_FLUSH_INTERVAL_MS = 30_000;

/**
 * Maximum number of `(module, method, kind)` triplets serialised as span
 * attributes on a single flush. Beyond this, the long tail is dropped from
 * the attribute payload — the headline measurements still reflect the totals.
 */
const MAX_AGGREGATE_ATTRIBUTE_ROWS = 64;

export interface TurboModuleContextOptions {
  /**
   * Additional TurboModules to track. Each entry's methods will be wrapped so
   * that any native crash happening inside a method call gets `contexts.turbo_module`
   * + `turbo_module.name` / `turbo_module.method` attached to the crash report,
   * and so the calls are recorded into the aggregator (subject to
   * `ignoreTurboModules`).
   *
   * The built-in `RNSentry` TurboModule is always tracked.
   */
  modules?: Array<{ name: string; module: object | null | undefined; skipMethods?: ReadonlyArray<string> }>;

  /**
   * Per-(module, method, kind) call-count / latency aggregation. When enabled,
   * each wrapped TurboModule invocation contributes to a small fixed set of
   * counters that flush:
   *   - on every transaction finish, as a synthetic `turbo_modules.aggregate`
   *     child span (per-call data in span attributes) plus headline
   *     measurements on the root span;
   *   - on a periodic timer (see `aggregateFlushIntervalMs`) so
   *     long-running sessions without transactions still emit a signal.
   *
   * Default: `true`.
   *
   * See https://github.com/getsentry/sentry-react-native/issues/6164.
   */
  enableAggregateStats?: boolean;

  /**
   * Interval in milliseconds for the periodic aggregate flush. Only used when
   * `enableAggregateStats` is enabled. The periodic flush emits a custom
   * Sentry event so the data survives sessions that never produce a transaction.
   *
   * Default: 30000 (30s). Set to `0` to disable the periodic timer (data is
   * still flushed on transaction finish).
   */
  aggregateFlushIntervalMs?: number;

  /**
   * TurboModules whose calls should NOT be counted in the aggregate. Users
   * may e.g. want to exclude `RNSentry` itself to keep the signal clean of
   * the SDK's own internal calls.
   *
   * Note: this does NOT disable wrapping — crashes during those calls still
   * get attributed via `contexts.turbo_module`. It only opts the module out
   * of the per-(module, method, kind) counters.
   */
  ignoreTurboModules?: ReadonlyArray<string>;
}

// Methods on RNSentry that must NOT be tracked:
//
// - `addListener` / `removeListeners` are RN event-emitter stubs that fire on
//   every subscriber registration — tracking them would just churn the scope.
//
// - The scope-sync methods (`setContext`, `setTag`, `setExtra`, `setUser`,
//   `addBreadcrumb`, `clearBreadcrumbs`, `setAttribute`, `setAttributes`,
//   `removeAttribute`) are called by our own `enableSyncToNative` hook every
//   time anything writes to a JS Scope. Tracking them would cause infinite
//   recursion: `pushTurboModuleCall` -> `scope.setContext` -> `NATIVE.setContext`
//   -> `RNSentry.setContext` (wrapped) -> `pushTurboModuleCall` -> ... .
const RNSENTRY_SKIP = [
  'addListener',
  'removeListeners',
  'setContext',
  'setTag',
  'setExtra',
  'setUser',
  'addBreadcrumb',
  'clearBreadcrumbs',
  'setAttribute',
  'setAttributes',
  'removeAttribute',
] as const;

/**
 * Attaches the currently-executing TurboModule method to the Sentry scope so
 * that native crashes can be attributed to the high-level RN module + method
 * (e.g. `RNSentry.captureEnvelope`) on top of the native stack trace.
 *
 * Additionally aggregates per-(module, method, kind) call-count / latency
 * counters and flushes them on transaction finish (as a synthetic
 * `turbo_modules.aggregate` child span with headline measurements on the root
 * span) and on a periodic timer (as a custom Sentry event) — see
 * https://github.com/getsentry/sentry-react-native/issues/6164.
 *
 * See https://github.com/getsentry/sentry-react-native/issues/6163 for the
 * crash-attribution side of this integration.
 */
export const turboModuleContextIntegration = (options: TurboModuleContextOptions = {}): Integration => {
  const enableAggregate = options.enableAggregateStats !== false;
  const flushIntervalMs = options.aggregateFlushIntervalMs ?? DEFAULT_AGGREGATE_FLUSH_INTERVAL_MS;

  let pendingFlushHandle: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // Wrap the live RNSentry TurboModule. Other integrations import the same
      // instance by reference, so wrapping here transparently tracks every call
      // made from JS — including the SDK's own internal envelope/scope sync
      // calls, which are the most likely entry points for native crashes.
      wrapTurboModule('RNSentry', getRNSentryModule(), { skip: RNSENTRY_SKIP });

      for (const entry of options.modules ?? []) {
        wrapTurboModule(entry.name, entry.module, { skip: entry.skipMethods });
      }

      if (enableAggregate) {
        setIgnoredTurboModules(options.ignoreTurboModules);
      }
    },
    setup(client: Client): void {
      if (!enableAggregate) {
        return;
      }

      // Flush on transaction finish is handled in `processEvent` below — by
      // the time `processEvent` runs the root span has already been built up
      // and we get a chance to mutate the serialised transaction directly,
      // avoiding a race with the root span's `end()`.

      // Periodic flush keeps the signal alive in sessions that never produce
      // a transaction (e.g. background JS work, long idle sessions with no
      // navigation). We arm a one-shot timer lazily — only when the
      // aggregator transitions from empty to non-empty — so idle sessions
      // don't churn a recurring timer. The next record after a flush
      // re-arms it.
      if (flushIntervalMs > 0) {
        setOnFirstTurboModuleRecord(() => {
          if (closed || pendingFlushHandle !== undefined) {
            return;
          }
          pendingFlushHandle = setTimeout(() => {
            pendingFlushHandle = undefined;
            flushPeriodicAggregate(client);
          }, flushIntervalMs);
        });
      }

      client.on?.('close', () => {
        closed = true;
        setOnFirstTurboModuleRecord(undefined);
        if (pendingFlushHandle !== undefined) {
          clearTimeout(pendingFlushHandle);
          pendingFlushHandle = undefined;
        }
      });
    },
    processEvent(event: Event): Event {
      if (!enableAggregate || event.type !== 'transaction') {
        return event;
      }
      if (!hasTurboModuleAggregateData()) {
        return event;
      }
      attachAggregateToTransactionEvent(event as TransactionEvent);
      return event;
    },
  };
};

/**
 * Mutates a transaction event in place to add the aggregate breakdown as a
 * synthetic child span plus a few headline measurements on the root span.
 */
function attachAggregateToTransactionEvent(event: TransactionEvent): void {
  const trace = event.contexts?.trace;
  if (!trace?.trace_id || !trace.span_id) {
    return;
  }
  const startTs = event.start_timestamp;
  const endTs = event.timestamp;
  if (typeof startTs !== 'number' || typeof endTs !== 'number') {
    return;
  }

  const snapshot = drainTurboModuleAggregate();
  if (snapshot.length === 0) {
    return;
  }

  const totals = summarise(snapshot);
  const topByTotalMs = [...snapshot].sort((a, b) => b.totalDurationMs - a.totalDurationMs);

  const aggregateSpan = createSpanJSON({
    op: TURBO_MODULES_AGGREGATE_OP,
    description: 'TurboModule call aggregate',
    start_timestamp: startTs,
    timestamp: endTs,
    trace_id: trace.trace_id,
    parent_span_id: trace.span_id,
    origin: TURBO_MODULES_AGGREGATE_ORIGIN,
    data: {
      'turbo_modules.total_call_count': totals.callCount,
      'turbo_modules.total_error_count': totals.errorCount,
      'turbo_modules.total_duration_ms': roundMs(totals.totalDurationMs),
      'turbo_modules.unique_methods': snapshot.length,
      ...serialiseRows(topByTotalMs.slice(0, MAX_AGGREGATE_ATTRIBUTE_ROWS)),
    },
  });

  event.spans = event.spans ?? [];
  event.spans.push(aggregateSpan);

  event.measurements = event.measurements ?? {};
  event.measurements['turbo_modules.call_count'] = { value: totals.callCount, unit: 'none' };
  event.measurements['turbo_modules.error_count'] = { value: totals.errorCount, unit: 'none' };
  event.measurements['turbo_modules.total_ms'] = { value: roundMs(totals.totalDurationMs), unit: 'millisecond' };

  const top = topByTotalMs[0];
  if (top) {
    event.measurements['turbo_modules.top_module_ms'] = {
      value: roundMs(top.totalDurationMs),
      unit: 'millisecond',
    };
  }

  if (snapshot.length > MAX_AGGREGATE_ATTRIBUTE_ROWS) {
    debug.log(
      `[TurboModuleContext] Aggregate has ${snapshot.length} rows, truncated to top ${MAX_AGGREGATE_ATTRIBUTE_ROWS} ` +
        `by total_ms on the aggregate span. Headline measurements still reflect the full totals.`,
    );
  }
}

/**
 * Emits the current aggregate as a custom Sentry event so long-running
 * sessions without a transaction still produce a signal. No-op when there's
 * nothing to flush.
 */
function flushPeriodicAggregate(client: Client): void {
  if (!hasTurboModuleAggregateData()) {
    return;
  }
  const snapshot = drainTurboModuleAggregate();
  const totals = summarise(snapshot);
  const topByTotalMs = [...snapshot].sort((a, b) => b.totalDurationMs - a.totalDurationMs);

  client.captureEvent?.({
    message: 'TurboModule aggregate (periodic)',
    level: 'info',
    tags: {
      'event.kind': 'turbo_modules.aggregate',
    },
    extra: {
      total_call_count: totals.callCount,
      total_error_count: totals.errorCount,
      total_duration_ms: roundMs(totals.totalDurationMs),
      unique_methods: snapshot.length,
      modules: topByTotalMs.slice(0, MAX_AGGREGATE_ATTRIBUTE_ROWS).map(serialiseRowAsObject),
    },
  });
}

function summarise(snapshot: ReadonlyArray<TurboModuleAggregate>): {
  callCount: number;
  errorCount: number;
  totalDurationMs: number;
} {
  let callCount = 0;
  let errorCount = 0;
  let totalDurationMs = 0;
  for (const row of snapshot) {
    callCount += row.callCount;
    errorCount += row.errorCount;
    totalDurationMs += row.totalDurationMs;
  }
  return { callCount, errorCount, totalDurationMs };
}

/**
 * Serialises an aggregate row into a flat set of span-attribute keys, prefixed
 * with the `(name.method.kind)` triplet. Span attributes are flat key→scalar
 * pairs so nested objects aren't an option here.
 */
function serialiseRows(rows: ReadonlyArray<TurboModuleAggregate>): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const row of rows) {
    const prefix = `turbo_modules.${row.name}.${row.method}.${row.kind}`;
    out[`${prefix}.count`] = row.callCount;
    out[`${prefix}.error_count`] = row.errorCount;
    out[`${prefix}.total_ms`] = roundMs(row.totalDurationMs);
    out[`${prefix}.max_ms`] = roundMs(row.maxDurationMs);
    for (let i = 0; i < row.buckets.length; i++) {
      const label = HISTOGRAM_BUCKET_LABELS[i];
      const count = row.buckets[i];
      if (label !== undefined && count !== undefined) {
        out[`${prefix}.${label}`] = count;
      }
    }
  }
  return out;
}

function serialiseRowAsObject(row: TurboModuleAggregate): {
  name: string;
  method: string;
  kind: string;
  call_count: number;
  error_count: number;
  total_ms: number;
  max_ms: number;
  histogram: Record<string, number>;
} {
  const histogram: Record<string, number> = {};
  for (let i = 0; i < row.buckets.length; i++) {
    const label = HISTOGRAM_BUCKET_LABELS[i];
    const count = row.buckets[i];
    if (label !== undefined && count !== undefined) {
      histogram[label] = count;
    }
  }
  return {
    name: row.name,
    method: row.method,
    kind: row.kind,
    call_count: row.callCount,
    error_count: row.errorCount,
    total_ms: roundMs(row.totalDurationMs),
    max_ms: roundMs(row.maxDurationMs),
    histogram,
  };
}

function roundMs(value: number): number {
  // Two-decimal precision is more than enough for human-readable totals
  // and keeps the JSON payload terse.
  return Math.round(value * 100) / 100;
}
