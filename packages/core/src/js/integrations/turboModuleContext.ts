/* oxlint-disable eslint(max-lines) */
import type { Client, Event, Integration, Span, TransactionEvent } from '@sentry/core';

import { addBreadcrumb, debug, spanToJSON } from '@sentry/core';

import {
  addTurboModuleCallStartObserver,
  addTurboModuleRecordObserver,
  hasTurboModuleAggregateData,
  removeTurboModuleCallStartObserver,
  removeTurboModuleRecordObserver,
  setAggregateRecordingEnabled,
  setIgnoredTurboModules,
  setOnFirstTurboModuleRecord,
  type TurboModuleCallStart,
  type TurboModuleRecord,
  wrapTurboModule,
} from '../turbomodule';
import { isRootSpan } from '../utils/span';
import { getRNSentryModule } from '../wrapper';
import {
  attachAggregateToTransactionEvent,
  flushPeriodicAggregate,
  roundMs,
  TURBO_MODULES_AGGREGATE_OP,
  TURBO_MODULES_AGGREGATE_ORIGIN,
} from './turboModuleContextFlush';

export { TURBO_MODULES_AGGREGATE_OP, TURBO_MODULES_AGGREGATE_ORIGIN };

export const INTEGRATION_NAME = 'TurboModuleContext';

/** Default flush cadence for the periodic timer, in milliseconds. */
export const DEFAULT_AGGREGATE_FLUSH_INTERVAL_MS = 30_000;

/** Default duration above which an async TurboModule call becomes a breadcrumb. */
export const DEFAULT_SLOW_CALL_THRESHOLD_MS = 500;

export const DEFAULT_MAX_TOP_MODULES_PER_SPAN = 16;

export const TURBO_MODULE_BREADCRUMB_CATEGORY = 'native.turbo_module';

/** Cap so abandoned (never-settling) promises can't pin `WindowState` forever. */
export const MAX_PENDING_CALL_WINDOWS = 1024;

/** Cap so sampled-out transactions can't leak their buffered attributes. */
export const MAX_PENDING_SPAN_ATTRIBUTES = 256;

export interface TurboModuleContextOptions {
  /** Additional TurboModules to wrap. `RNSentry` is always tracked. */
  modules?: Array<{ name: string; module: object | null | undefined; skipMethods?: ReadonlyArray<string> }>;

  /** Per-(module, method, kind) counters, flushed on transaction finish and on a periodic timer. Default: `true`. */
  enableAggregateStats?: boolean;

  /** Periodic aggregate flush interval, ms. `0` disables the periodic timer. Default: `30000`. */
  aggregateFlushIntervalMs?: number;

  /**
   * Modules opted out of the aggregate (still wrapped for crash context).
   * Default `['RNSentry']` — the SDK's own transport calls would otherwise
   * pollute the signal and self-re-arm the periodic timer indefinitely.
   */
  ignoreTurboModules?: ReadonlyArray<string>;

  /** Per-`(module, method)` breakdown on root-span `spanEnd`. Default: `true`. */
  enableSpanAttribution?: boolean;

  /** Async-call duration above which a `native.turbo_module` breadcrumb fires. `0` disables. Default: `500`. */
  slowCallThresholdMs?: number;

  /** Cap on per-`(module, method)` rows attributed to a single span. Default: `16`. */
  maxTopModulesPerSpan?: number;
}

// Scope-sync methods must NOT be tracked — `enableSyncToNative` calls them on
// every Scope write, so wrapping them would recurse infinitely via
// `pushTurboModuleCall` -> `scope.setContext` -> `RNSentry.setContext`.
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
 * Attributes TurboModule invocations to the Sentry scope for crash context,
 * aggregates per-`(module, method, kind)` counters into transaction events,
 * attaches a per-span breakdown on `spanEnd`, and emits slow-call breadcrumbs.
 */
export const turboModuleContextIntegration = (options: TurboModuleContextOptions = {}): Integration => {
  const enableAggregate = options.enableAggregateStats !== false;
  const enableSpanAttribution = options.enableSpanAttribution !== false;
  const flushIntervalMs = options.aggregateFlushIntervalMs ?? DEFAULT_AGGREGATE_FLUSH_INTERVAL_MS;
  const slowCallThresholdMs = options.slowCallThresholdMs ?? DEFAULT_SLOW_CALL_THRESHOLD_MS;
  const maxTopModulesPerSpan = options.maxTopModulesPerSpan ?? DEFAULT_MAX_TOP_MODULES_PER_SPAN;

  let pendingFlushHandle: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  // WeakMap: O(1) lookup in spanEnd. Array: hot-path iteration in recordObserver.
  const openWindows: WeakMap<Span, WindowState> = new WeakMap();
  const openWindowList: WindowState[] = [];
  // Keyed by `recordId` so a call that settles after its originating span
  // ended still credits that span.
  const pendingCallWindows: Map<number, WindowState[]> = new Map();
  // Buffer for `processEvent` merging: `Span#setAttributes` on a frozen span
  // is a no-op, so late records after `spanEnd` can only land via the event.
  const pendingSpanAttributes: Map<string, Record<string, number | string | undefined>> = new Map();
  let recordObserver: ((record: TurboModuleRecord) => void) | undefined;
  let startObserver: ((start: TurboModuleCallStart) => void) | undefined;

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      wrapTurboModule('RNSentry', getRNSentryModule(), { skip: RNSENTRY_SKIP });

      for (const entry of options.modules ?? []) {
        wrapTurboModule(entry.name, entry.module, { skip: entry.skipMethods });
      }

      setAggregateRecordingEnabled(enableAggregate);
      if (enableAggregate || enableSpanAttribution || slowCallThresholdMs > 0) {
        setIgnoredTurboModules(options.ignoreTurboModules ?? ['RNSentry']);
      }
    },
    setup(client: Client): void {
      if (enableAggregate && flushIntervalMs > 0) {
        // Lazy re-arm keeps idle sessions from churning a recurring timer.
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

      // Snapshot on every start (any kind): `wrapTurboModule` always calls
      // `notifyTurboModuleCallStart` with `'sync'` and only relabels to
      // `'async'` after the return value proves thenable, so gating by kind
      // here would silently drop all async attribution.
      if (enableSpanAttribution) {
        startObserver = (start: TurboModuleCallStart): void => {
          if (pendingCallWindows.size >= MAX_PENDING_CALL_WINDOWS) {
            const oldest = pendingCallWindows.keys().next().value;
            if (oldest !== undefined) {
              pendingCallWindows.delete(oldest);
            }
          }
          pendingCallWindows.set(start.recordId, openWindowList.slice());
        };
        addTurboModuleCallStartObserver(startObserver);
      }

      const wantsBreadcrumbs = slowCallThresholdMs > 0;
      if (enableSpanAttribution || wantsBreadcrumbs) {
        recordObserver = (record: TurboModuleRecord): void => {
          if (enableSpanAttribution) {
            if (record.recordId !== undefined) {
              const windows = pendingCallWindows.get(record.recordId);
              pendingCallWindows.delete(record.recordId);
              // Empty `windows` means no spans were open at call start —
              // don't fall back to `openWindowList` or we'd credit a later span.
              if (windows) {
                for (const window of windows) {
                  recordIntoWindow(window, record);
                  if (window.closed) {
                    attachWindowToSpan(window.span, window, maxTopModulesPerSpan, pendingSpanAttributes);
                  }
                }
              }
            } else {
              for (const window of openWindowList) {
                recordIntoWindow(window, record);
              }
            }
          }

          if (wantsBreadcrumbs && record.kind === 'async' && record.durationMs >= slowCallThresholdMs) {
            addBreadcrumb({
              category: TURBO_MODULE_BREADCRUMB_CATEGORY,
              level: 'info',
              type: 'default',
              message: `${record.name}.${record.method} took ${roundMs(record.durationMs)}ms`,
              data: {
                module: record.name,
                method: record.method,
                kind: record.kind,
                duration_ms: roundMs(record.durationMs),
                errored: record.errored,
              },
            });
          }
        };
        addTurboModuleRecordObserver(recordObserver);
      }

      if (enableSpanAttribution) {
        client.on?.('spanStart', (span: Span) => {
          if (!isRootSpan(span)) {
            return;
          }
          if (openWindows.has(span)) {
            return;
          }
          const window: WindowState = { span, closed: false, counters: new Map() };
          openWindows.set(span, window);
          openWindowList.push(window);
        });

        client.on?.('spanEnd', (span: Span) => {
          const window = openWindows.get(span);
          if (!window) {
            return;
          }
          openWindows.delete(span);
          const idx = openWindowList.indexOf(window);
          if (idx >= 0) {
            openWindowList.splice(idx, 1);
          }
          window.closed = true;
          attachWindowToSpan(span, window, maxTopModulesPerSpan, pendingSpanAttributes);
        });
      }

      client.on?.('close', () => {
        closed = true;
        setOnFirstTurboModuleRecord(undefined);
        if (pendingFlushHandle !== undefined) {
          clearTimeout(pendingFlushHandle);
          pendingFlushHandle = undefined;
        }
        if (recordObserver) {
          removeTurboModuleRecordObserver(recordObserver);
          recordObserver = undefined;
        }
        if (startObserver) {
          removeTurboModuleCallStartObserver(startObserver);
          startObserver = undefined;
        }
        openWindowList.length = 0;
        pendingCallWindows.clear();
        pendingSpanAttributes.clear();
      });
    },
    processEvent(event: Event): Event {
      if (event.type !== 'transaction') {
        return event;
      }
      const txEvent = event as TransactionEvent;

      if (enableAggregate && hasTurboModuleAggregateData()) {
        attachAggregateToTransactionEvent(txEvent);
      }

      // Guaranteed-delivery path for span attributes: `setAttributes` on the
      // frozen span is a no-op, so late-settling records can only land here.
      if (enableSpanAttribution) {
        const rootSpanId = txEvent.contexts?.trace?.span_id;
        if (rootSpanId) {
          const pending = pendingSpanAttributes.get(rootSpanId);
          if (pending) {
            pendingSpanAttributes.delete(rootSpanId);
            mergeAttributesIntoTraceData(txEvent, pending);
          }
        }
      }

      return event;
    },
  };
};

interface WindowRow {
  name: string;
  method: string;
  callCount: number;
  errorCount: number;
  totalDurationMs: number;
}

interface WindowState {
  span: Span;
  /** `true` after `spanEnd` — late records still credit and re-emit. */
  closed: boolean;
  counters: Map<string, Map<string, WindowRow>>;
  /** Previously-written top-N keys, used to clear stale ones on re-emit. */
  writtenPerMethodKeys?: Set<string>;
}

function recordIntoWindow(window: WindowState, record: TurboModuleRecord): void {
  let byMethod = window.counters.get(record.name);
  if (!byMethod) {
    byMethod = new Map();
    window.counters.set(record.name, byMethod);
  }
  let row = byMethod.get(record.method);
  if (!row) {
    row = {
      name: record.name,
      method: record.method,
      callCount: 0,
      errorCount: 0,
      totalDurationMs: 0,
    };
    byMethod.set(record.method, row);
  }
  row.callCount += 1;
  row.totalDurationMs += record.durationMs;
  if (record.errored) {
    row.errorCount += 1;
  }
}

function attachWindowToSpan(
  span: Span,
  window: WindowState,
  topN: number,
  pendingSpanAttributes: Map<string, Record<string, number | string | undefined>>,
): void {
  if (window.counters.size === 0) {
    return;
  }

  const rows: WindowRow[] = [];
  let totalCallCount = 0;
  let totalErrorCount = 0;
  let totalDurationMs = 0;
  for (const byMethod of window.counters.values()) {
    for (const row of byMethod.values()) {
      rows.push(row);
      totalCallCount += row.callCount;
      totalErrorCount += row.errorCount;
      totalDurationMs += row.totalDurationMs;
    }
  }
  rows.sort((a, b) => b.totalDurationMs - a.totalDurationMs);

  const attributes: Record<string, number | string | undefined> = {
    'turbo_module.total_call_count': totalCallCount,
    'turbo_module.total_error_count': totalErrorCount,
    'turbo_module.total_duration_ms': roundMs(totalDurationMs),
    'turbo_module.unique_methods': rows.length,
  };
  const top = rows[0];
  if (top) {
    attributes['turbo_module.top_module'] = `${top.name}.${top.method}`;
    attributes['turbo_module.top_module_duration_ms'] = roundMs(top.totalDurationMs);
  }
  const capped = rows.slice(0, topN);
  const nextKeys = new Set<string>();
  for (const row of capped) {
    const prefix = `turbo_module.${safeKeyPart(row.name)}.${safeKeyPart(row.method)}`;
    const callCountKey = `${prefix}.call_count`;
    const durationKey = `${prefix}.duration_ms`;
    const errorCountKey = `${prefix}.error_count`;
    attributes[callCountKey] = row.callCount;
    attributes[durationKey] = roundMs(row.totalDurationMs);
    attributes[errorCountKey] = row.errorCount;
    nextKeys.add(callCountKey);
    nextKeys.add(durationKey);
    nextKeys.add(errorCountKey);
  }
  // `setAttributes` merges, so keys dropped from top-N must be explicitly
  // cleared with `undefined` or they linger from a previous emit.
  if (window.writtenPerMethodKeys) {
    for (const key of window.writtenPerMethodKeys) {
      if (!nextKeys.has(key)) {
        attributes[key] = undefined;
      }
    }
  }
  window.writtenPerMethodKeys = nextKeys;

  if (rows.length > topN) {
    const spanId = spanToJSON(span).span_id;
    debug.log(
      `[TurboModuleContext] Span ${spanId ?? '(unknown)'} touched ${rows.length} unique TurboModule methods, ` +
        `truncated to top ${topN} by duration. Summary attributes still reflect the full totals.`,
    );
  }

  span.setAttributes(attributes);

  const spanId = spanToJSON(span).span_id;
  if (spanId) {
    if (!pendingSpanAttributes.has(spanId) && pendingSpanAttributes.size >= MAX_PENDING_SPAN_ATTRIBUTES) {
      const oldest = pendingSpanAttributes.keys().next().value;
      if (oldest !== undefined) {
        pendingSpanAttributes.delete(oldest);
      }
    }
    pendingSpanAttributes.set(spanId, attributes);
  }
}

/** `.` is the attribute-key delimiter — escape it in name/method to avoid collisions. */
function safeKeyPart(s: string): string {
  return s.replace(/\./g, '_');
}

function mergeAttributesIntoTraceData(
  event: TransactionEvent,
  attributes: Record<string, number | string | undefined>,
): void {
  const trace = event.contexts?.trace;
  if (!trace) {
    return;
  }
  const data = { ...((trace.data as Record<string, unknown> | undefined) ?? {}) };
  for (const key of Object.keys(attributes)) {
    const value = attributes[key];
    if (value === undefined) {
      // oxlint-disable-next-line typescript-eslint(no-dynamic-delete)
      delete data[key];
    } else {
      data[key] = value;
    }
  }
  trace.data = data;
}
