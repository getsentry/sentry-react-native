import type { Client, TransactionEvent } from '@sentry/core';

import { debug } from '@sentry/core';

import { createSpanJSON } from '../tracing/utils';
import {
  drainTurboModuleAggregate,
  HISTOGRAM_BUCKET_LABELS,
  hasTurboModuleAggregateData,
  type TurboModuleAggregate,
} from '../turbomodule';

export const TURBO_MODULES_AGGREGATE_OP = 'turbo_modules.aggregate';
export const TURBO_MODULES_AGGREGATE_ORIGIN = 'auto.tracing.turbo_modules';

const MAX_AGGREGATE_ATTRIBUTE_ROWS = 64;

// Runs before `beforeSendTransaction`, so a user-dropped transaction loses one interval — self-healing.
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

function serialiseRows(rows: ReadonlyArray<TurboModuleAggregate>): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const row of rows) {
    const prefix = `turbo_modules.${safeKeyPart(row.name)}.${safeKeyPart(row.method)}.${row.kind}`;
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

export function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}

// `.` is the attribute-key delimiter — escape to `_` (and pre-escape existing `_` as `__`)
// so `(a.b, c)` and `(a_b, c)` don't collapse to the same key.
function safeKeyPart(s: string): string {
  return s.replace(/_/g, '__').replace(/\./g, '_');
}
