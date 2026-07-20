import type { Client, TransactionEvent } from '@sentry/core';

import { debug } from '@sentry/core';

import { createSpanJSON } from '../tracing/utils';
import {
  drainTurboModuleAggregate,
  HISTOGRAM_BUCKET_LABELS,
  hasTurboModuleAggregateData,
  type TurboModuleAggregate,
} from '../turbomodule';

/** Op for the synthetic child span that carries the aggregate breakdown. */
export const TURBO_MODULES_AGGREGATE_OP = 'turbo_modules.aggregate';

/** Origin string set on the aggregate span so it shows up as auto-instrumented. */
export const TURBO_MODULES_AGGREGATE_ORIGIN = 'auto.tracing.turbo_modules';

/**
 * Maximum number of `(module, method, kind)` triplets serialised as span
 * attributes on a single flush. Beyond this, the long tail is dropped from
 * the attribute payload — the headline measurements still reflect the totals.
 */
const MAX_AGGREGATE_ATTRIBUTE_ROWS = 64;

/**
 * Mutates a transaction event in place to add the aggregate breakdown as a
 * synthetic child span plus a few headline measurements on the root span.
 *
 * Draining here runs before `beforeSendTransaction`, so if a user hook drops
 * this transaction, the drained batch is lost. Trade-off is intentional:
 * peeking without draining would require send-confirmation bookkeeping across
 * events and multiple transactions in flight would double-count. Data loss
 * from a dropped transaction is bounded (one interval) and self-heals — the
 * next transaction or periodic flush picks up fresh activity.
 */
export function attachAggregateToTransactionEvent(event: TransactionEvent): void {
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
 *
 * `client.captureEvent` reaches wrapped `RNSentry.captureEnvelope` via the
 * native transport — so if `RNSentry` were aggregated, the flush's own send
 * would re-arm the lazy timer indefinitely. `ignoreTurboModules` defaults
 * to `['RNSentry']` for exactly this reason.
 */
export function flushPeriodicAggregate(client: Client): void {
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

/**
 * Rounds to two-decimal precision — enough for human-readable totals and
 * keeps the JSON payload terse.
 */
export function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}
