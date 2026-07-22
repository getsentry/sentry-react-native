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

/**
 * Default cap on the number of `(module, method)` rows serialised as attributes
 * on a single active span. Beyond this, the long tail is dropped; the summary
 * attributes still reflect the totals.
 */
export const DEFAULT_MAX_TOP_MODULES_PER_SPAN = 16;

/** Breadcrumb category for slow-call notifications. */
export const TURBO_MODULE_BREADCRUMB_CATEGORY = 'native.turbo_module';

/**
 * Upper bound on `pendingCallWindows` size. Each in-flight async TurboModule
 * call adds an entry that's removed when the call settles; a bounded cap keeps
 * abandoned (never-settling) promises from pinning `WindowState` forever.
 * When exceeded, the oldest entry is dropped — its late-settling record is
 * silently ignored rather than mis-attributed to a later span.
 */
export const MAX_PENDING_CALL_WINDOWS = 1024;

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
   * TurboModules whose calls should NOT be counted in the aggregate.
   *
   * Default: `['RNSentry']`. The SDK's own transport call
   * (`RNSentry.captureEnvelope`) fires from every `captureEvent`, so leaving
   * `RNSentry` in the aggregate would (a) pollute app-level TurboModule
   * signals with SDK internal noise and (b) allow the periodic flush's own
   * `captureEvent` to record back into the aggregator and perpetually re-arm
   * the flush timer in idle sessions. Pass `[]` to opt back in.
   *
   * Note: this does NOT disable wrapping — crashes during those calls still
   * get attributed via `contexts.turbo_module`. It only opts the module out
   * of the per-(module, method, kind) counters.
   */
  ignoreTurboModules?: ReadonlyArray<string>;

  /**
   * On `spanEnd`, attach a per-`(module, method)` TurboModule call breakdown
   * to root spans as `turbo_module.<name>.<method>.{call_count,duration_ms,error_count}`
   * attributes plus summary keys. Only root spans are attributed so nested
   * user spans don't double-count.
   *
   * Default: `true`. See https://github.com/getsentry/sentry-react-native/issues/6165.
   */
  enableSpanAttribution?: boolean;

  /**
   * Minimum duration for an async TurboModule call to emit a
   * `native.turbo_module` breadcrumb. Sync calls are excluded — they block JS
   * and are covered by stall / frozen-frame instrumentation.
   *
   * Default: `500`. Set to `0` to disable.
   */
  slowCallThresholdMs?: number;

  /**
   * Maximum `(module, method)` rows serialised as attributes on a single span.
   * Beyond this the tail is dropped; summary attributes still reflect totals.
   *
   * Default: `16`.
   */
  maxTopModulesPerSpan?: number;
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
  const enableSpanAttribution = options.enableSpanAttribution !== false;
  const flushIntervalMs = options.aggregateFlushIntervalMs ?? DEFAULT_AGGREGATE_FLUSH_INTERVAL_MS;
  const slowCallThresholdMs = options.slowCallThresholdMs ?? DEFAULT_SLOW_CALL_THRESHOLD_MS;
  const maxTopModulesPerSpan = options.maxTopModulesPerSpan ?? DEFAULT_MAX_TOP_MODULES_PER_SPAN;

  let pendingFlushHandle: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  // Two structures for the same set of open root spans: the WeakMap gives O(1)
  // lookup in `spanEnd`, the parallel array is what the record observer
  // iterates on the hot path. Both are cleaned in `spanEnd`; a span that never
  // fires `spanEnd` stays pinned via `openWindowList` until `client.close`
  // (root spans are always eventually ended in practice, so this is bounded).
  const openWindows: WeakMap<Span, WindowState> = new WeakMap();
  const openWindowList: WindowState[] = [];
  // Windows open at each in-flight call's start. Keyed by the wrap layer's
  // `recordId` so async calls that settle after their originating span has
  // ended still get credited to that span. Bounded by MAX_PENDING_CALL_WINDOWS
  // so a chatty session where some promises never settle can't leak forever.
  const pendingCallWindows: Map<number, WindowState[]> = new Map();
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
      // Applied whenever any consumer of the record path is active — the
      // aggregate map, span attribution, or the slow-call breadcrumb — so
      // RNSentry's own transport calls are filtered from every surface.
      if (enableAggregate || enableSpanAttribution) {
        setIgnoredTurboModules(options.ignoreTurboModules ?? ['RNSentry']);
      }
    },
    setup(client: Client): void {
      if (enableAggregate && flushIntervalMs > 0) {
        // Lazy re-arm: keeps idle sessions from churning a recurring timer.
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

      if (enableSpanAttribution) {
        // Always record a snapshot — even an empty one — so a call that started
        // when no root span was open never gets attributed to spans that
        // opened between call start and settle.
        startObserver = (start: TurboModuleCallStart): void => {
          if (pendingCallWindows.size >= MAX_PENDING_CALL_WINDOWS) {
            // Drop oldest entry (Map preserves insertion order). Its record,
            // if it ever settles, falls through the `if (windows)` gate and
            // is silently ignored — better than mis-attributing to a later span.
            const oldest = pendingCallWindows.keys().next().value;
            if (oldest !== undefined) {
              pendingCallWindows.delete(oldest);
            }
          }
          pendingCallWindows.set(start.recordId, openWindowList.slice());
        };
        addTurboModuleCallStartObserver(startObserver);

        recordObserver = (record: TurboModuleRecord): void => {
          if (record.recordId !== undefined) {
            const windows = pendingCallWindows.get(record.recordId);
            pendingCallWindows.delete(record.recordId);
            // `windows` may be an empty array (no spans open at call start).
            // Either way, credit only what was captured — the currently-open
            // spans opened *after* this call and must not receive its data.
            if (windows) {
              for (const window of windows) {
                recordIntoWindow(window, record);
                // If the span has already ended, re-emit the attributes so a
                // late-settling async call still lands on the span before the
                // parent transaction is serialised.
                if (window.closed) {
                  attachWindowToSpan(window.span, window, maxTopModulesPerSpan);
                }
              }
            }
          } else {
            // No `recordId` means the caller bypassed `notifyTurboModuleCallStart`
            // (e.g. a direct `recordTurboModuleCall` in tests). Fall back to
            // the currently-open windows.
            for (const window of openWindowList) {
              recordIntoWindow(window, record);
            }
          }

          if (slowCallThresholdMs > 0 && record.kind === 'async' && record.durationMs >= slowCallThresholdMs) {
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
          attachWindowToSpan(span, window, maxTopModulesPerSpan);
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
      });
    },
    processEvent(event: Event): Event {
      // Drop the empty-string sentinel tags written by `clearScope` when no
      // TurboModule call is active. Sentry ingestion rejects empty tag values
      // and flags the event with a Processing Error. See #6502.
      stripEmptySentinelTags(event);

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

function stripEmptySentinelTags(event: Event): void {
  const tags = event.tags;
  if (!tags) {
    return;
  }
  if (tags['turbo_module.name'] === '') {
    delete tags['turbo_module.name'];
  }
  if (tags['turbo_module.method'] === '') {
    delete tags['turbo_module.method'];
  }
}

interface WindowRow {
  name: string;
  method: string;
  callCount: number;
  errorCount: number;
  totalDurationMs: number;
}

interface WindowState {
  span: Span;
  // `true` after `spanEnd` fires. Late-settling async calls that were tracked
  // via `pendingCallWindows` still credit the window and re-emit
  // `setAttributes` on the span so the transaction picks up the update.
  closed: boolean;
  // Nested `name → method → row` so identifiers with any character (spaces,
  // dots, etc.) can never collide with the pair separator.
  counters: Map<string, Map<string, WindowRow>>;
  // Per-method attribute keys written on the previous `attachWindowToSpan`
  // call. On re-emit (late-settling async), any key not in the new top-N is
  // cleared so stale rows don't survive re-ranking. `setAttributes` merges,
  // so without this the dropped tail would linger.
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

function attachWindowToSpan(span: Span, window: WindowState, topN: number): void {
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
    const prefix = `turbo_module.${row.name}.${row.method}`;
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
  // Clear per-method keys written on a previous emit that no longer fit in the
  // top-N. `setAttributes` merges, so a bare re-emit would leave stale rows.
  // Setting undefined removes the attribute from the span.
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
}
