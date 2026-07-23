import type { Client, Event, Span, TransactionEvent } from '@sentry/core';

import { Scope } from '@sentry/core';
import * as SentryCore from '@sentry/core';

import {
  DEFAULT_AGGREGATE_FLUSH_INTERVAL_MS,
  DEFAULT_SLOW_CALL_THRESHOLD_MS,
  MAX_PENDING_CALL_WINDOWS,
  turboModuleContextIntegration,
  TURBO_MODULE_BREADCRUMB_CATEGORY,
  TURBO_MODULES_AGGREGATE_OP,
} from '../../src/js/integrations/turboModuleContext';
import * as turboModule from '../../src/js/turbomodule';
import {
  _resetTurboModuleAggregator,
  hasTurboModuleAggregateData,
  notifyTurboModuleCallStart,
  recordTurboModuleCall,
} from '../../src/js/turbomodule/turboModuleAggregator';
import * as spanUtils from '../../src/js/utils/span';
import * as wrapper from '../../src/js/wrapper';

function makeTransactionEvent(overrides: Partial<TransactionEvent> = {}): TransactionEvent {
  return {
    type: 'transaction',
    start_timestamp: 1_000,
    timestamp: 2_000,
    contexts: {
      trace: {
        trace_id: 'a'.repeat(32),
        span_id: 'b'.repeat(16),
      },
    },
    ...overrides,
  } as TransactionEvent;
}

function makeMockClient(): Client & { on: jest.Mock; captureEvent: jest.Mock } {
  return {
    on: jest.fn(),
    captureEvent: jest.fn(),
  } as unknown as Client & { on: jest.Mock; captureEvent: jest.Mock };
}

type ClientHandler = (arg: unknown) => void;

function makeClientWithSpanHooks(): {
  client: Client & { on: jest.Mock; captureEvent: jest.Mock };
  handlers: Map<string, ClientHandler[]>;
  emit: (event: string, arg: unknown) => void;
} {
  const handlers = new Map<string, ClientHandler[]>();
  const client = {
    on: jest.fn((event: string, cb: ClientHandler) => {
      const list = handlers.get(event) ?? [];
      list.push(cb);
      handlers.set(event, list);
    }),
    captureEvent: jest.fn(),
  } as unknown as Client & { on: jest.Mock; captureEvent: jest.Mock };
  return {
    client,
    handlers,
    emit: (event: string, arg: unknown) => {
      for (const cb of handlers.get(event) ?? []) {
        cb(arg);
      }
    },
  };
}

function makeFakeSpan(overrides: { spanId?: string } = {}): Span & {
  setAttributes: jest.Mock;
  spanContext: () => { spanId: string; traceId: string; traceFlags: number };
} {
  const attributes: Record<string, unknown> = {};
  return {
    setAttributes: jest.fn((next: Record<string, unknown>) => {
      Object.assign(attributes, next);
    }),
    spanContext: () => ({
      spanId: overrides.spanId ?? 'span-id',
      traceId: 't'.repeat(32),
      traceFlags: 1,
    }),
    __attributes: attributes,
  } as unknown as Span & {
    setAttributes: jest.Mock;
    spanContext: () => { spanId: string; traceId: string; traceFlags: number };
  };
}

describe('turboModuleContextIntegration', () => {
  let scope: Scope;

  beforeEach(() => {
    scope = new Scope();
    jest.spyOn(SentryCore, 'getCurrentScope').mockReturnValue(scope);
    _resetTurboModuleAggregator();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    _resetTurboModuleAggregator();
  });

  it('wraps the live RNSentry TurboModule on setup', () => {
    const fakeModule = {
      addListener: jest.fn(),
      removeListeners: jest.fn(),
      crash: jest.fn(),
    };
    jest.spyOn(wrapper, 'getRNSentryModule').mockReturnValue(fakeModule as never);

    const wrapSpy = jest.spyOn(turboModule, 'wrapTurboModule');

    turboModuleContextIntegration().setupOnce!();

    expect(wrapSpy).toHaveBeenCalledWith('RNSentry', fakeModule, {
      skip: [
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
      ],
    });
  });

  it('does not wrap scope-sync methods on RNSentry (would recurse infinitely)', () => {
    // Sanity check: every method `scopeSync.ts` forwards to NATIVE.* via
    // RNSentry must be in the skip list, otherwise scope writes recurse.
    const fakeModule = {
      setContext: jest.fn(),
      setTag: jest.fn(),
      setExtra: jest.fn(),
      setUser: jest.fn(),
      addBreadcrumb: jest.fn(),
      clearBreadcrumbs: jest.fn(),
      setAttribute: jest.fn(),
      setAttributes: jest.fn(),
      removeAttribute: jest.fn(),
      crash: jest.fn(),
    };
    jest.spyOn(wrapper, 'getRNSentryModule').mockReturnValue(fakeModule as never);

    const originalCrash = fakeModule.crash;
    turboModuleContextIntegration().setupOnce!();

    // crash is wrapped (replaced with sentryTurboModuleWrapper, which is a plain
    // function and therefore lacks the `_isMockFunction` marker the jest mocks carry).
    expect(fakeModule.crash).not.toBe(originalCrash);
    expect((fakeModule.crash as { _isMockFunction?: boolean })._isMockFunction).toBeUndefined();
    for (const method of [
      'setContext',
      'setTag',
      'setExtra',
      'setUser',
      'addBreadcrumb',
      'clearBreadcrumbs',
      'setAttribute',
      'setAttributes',
      'removeAttribute',
    ] as const) {
      // jest mocks expose `_isMockFunction` — if the method is still the
      // original mock, it's intact; if it were our wrapper, that property
      // would be missing.
      expect(fakeModule[method]._isMockFunction).toBe(true);
    }
  });

  it('wraps additional modules supplied via options', () => {
    jest.spyOn(wrapper, 'getRNSentryModule').mockReturnValue(undefined);

    const fakeOther = { run: jest.fn() };
    const wrapSpy = jest.spyOn(turboModule, 'wrapTurboModule');

    turboModuleContextIntegration({
      modules: [{ name: 'Other', module: fakeOther, skipMethods: ['ignored'] }],
    }).setupOnce!();

    expect(wrapSpy).toHaveBeenCalledWith('Other', fakeOther, { skip: ['ignored'] });
  });

  it('tolerates a missing RNSentry module', () => {
    jest.spyOn(wrapper, 'getRNSentryModule').mockReturnValue(undefined);

    expect(() => turboModuleContextIntegration().setupOnce!()).not.toThrow();
  });

  describe('empty-sentinel tag stripping', () => {
    beforeEach(() => {
      jest.spyOn(wrapper, 'getRNSentryModule').mockReturnValue(undefined);
    });

    it('strips empty turbo_module.name / turbo_module.method tags on any event', () => {
      const integration = turboModuleContextIntegration({ enableAggregateStats: false });
      integration.setupOnce?.();
      integration.setup?.(makeMockClient());

      const event: Event = {
        tags: {
          'turbo_module.name': '',
          'turbo_module.method': '',
          other: 'kept',
        },
      };
      const out = integration.processEvent?.(event, {}, makeMockClient()) as Event;

      expect(out.tags).toEqual({ other: 'kept' });
    });

    it('keeps non-empty turbo_module.* tag values untouched', () => {
      const integration = turboModuleContextIntegration({ enableAggregateStats: false });
      integration.setupOnce?.();
      integration.setup?.(makeMockClient());

      const event: Event = {
        tags: {
          'turbo_module.name': 'RNSentry',
          'turbo_module.method': 'captureEnvelope',
        },
      };
      const out = integration.processEvent?.(event, {}, makeMockClient()) as Event;

      expect(out.tags).toEqual({
        'turbo_module.name': 'RNSentry',
        'turbo_module.method': 'captureEnvelope',
      });
    });

    it('handles events without a tags object', () => {
      const integration = turboModuleContextIntegration({ enableAggregateStats: false });
      integration.setupOnce?.();
      integration.setup?.(makeMockClient());

      const event: Event = {};
      expect(() => integration.processEvent?.(event, {}, makeMockClient())).not.toThrow();
    });
  });

  describe('aggregate stats', () => {
    beforeEach(() => {
      jest.spyOn(wrapper, 'getRNSentryModule').mockReturnValue(undefined);
    });

    it('attaches a turbo_modules.aggregate child span + headline measurements on transaction finish', () => {
      const integration = turboModuleContextIntegration({ aggregateFlushIntervalMs: 0 });
      integration.setupOnce?.();
      integration.setup?.(makeMockClient());

      recordTurboModuleCall({
        name: 'UserMod',
        method: 'work',
        kind: 'async',
        durationMs: 12,
        errored: false,
      });
      recordTurboModuleCall({
        name: 'UserMod',
        method: 'work',
        kind: 'async',
        durationMs: 8,
        errored: true,
      });

      const event = makeTransactionEvent();
      const out = integration.processEvent?.(event, {}, makeMockClient()) as TransactionEvent;

      expect(out.spans).toHaveLength(1);
      expect(out.spans?.[0]).toMatchObject({ op: TURBO_MODULES_AGGREGATE_OP });
      expect(out.spans?.[0]?.data).toMatchObject({
        'turbo_modules.UserMod.work.async.count': 2,
        'turbo_modules.UserMod.work.async.error_count': 1,
        'turbo_modules.UserMod.work.async.total_ms': 20,
      });
      expect(out.measurements).toMatchObject({
        'turbo_modules.call_count': { value: 2, unit: 'none' },
        'turbo_modules.total_ms': { value: 20, unit: 'millisecond' },
      });
    });

    it('ignores RNSentry by default so the flush self-send does not loop', () => {
      // RNSentry is in the default `ignoreTurboModules` set — this is what
      // keeps the flush's own `captureEvent → RNSentry.captureEnvelope`
      // call from feeding back into the aggregator and re-arming the
      // periodic timer forever in idle sessions.
      jest.useFakeTimers();
      const integration = turboModuleContextIntegration();
      integration.setupOnce?.();
      const client = makeMockClient();
      // Simulate the transport wiring: every captureEvent replays the
      // TurboModule call the RN transport would have made.
      client.captureEvent.mockImplementation(() => {
        recordTurboModuleCall({
          name: 'RNSentry',
          method: 'captureEnvelope',
          kind: 'async',
          durationMs: 3,
          errored: false,
        });
        return 'event-id';
      });
      integration.setup?.(client);

      recordTurboModuleCall({ name: 'User', method: 'work', kind: 'sync', durationMs: 1, errored: false });
      jest.advanceTimersByTime(DEFAULT_AGGREGATE_FLUSH_INTERVAL_MS);
      expect(client.captureEvent).toHaveBeenCalledTimes(1);

      // If RNSentry weren't default-ignored, the self-noise would land
      // in the map and re-arm the timer — a second capture would land
      // after another interval, then a third, ad infinitum.
      jest.advanceTimersByTime(DEFAULT_AGGREGATE_FLUSH_INTERVAL_MS * 10);
      expect(client.captureEvent).toHaveBeenCalledTimes(1);

      // The RNSentry call from the transport is dropped, so the map is
      // empty and the next real user call is a fresh empty→non-empty
      // transition that re-arms the timer.
      expect(hasTurboModuleAggregateData()).toBe(false);
      recordTurboModuleCall({ name: 'User', method: 'work', kind: 'sync', durationMs: 2, errored: false });
      jest.advanceTimersByTime(DEFAULT_AGGREGATE_FLUSH_INTERVAL_MS);
      expect(client.captureEvent).toHaveBeenCalledTimes(2);
    });

    it('respects an explicit ignoreTurboModules override even when it opts RNSentry back in', () => {
      // Users who want RNSentry aggregation can pass `[]` (or a list
      // without RNSentry) to override the default. Verify the override
      // is honoured end-to-end.
      const integration = turboModuleContextIntegration({
        aggregateFlushIntervalMs: 0,
        ignoreTurboModules: [],
      });
      integration.setupOnce?.();
      integration.setup?.(makeMockClient());

      recordTurboModuleCall({
        name: 'RNSentry',
        method: 'captureEnvelope',
        kind: 'async',
        durationMs: 5,
        errored: false,
      });

      const event = makeTransactionEvent();
      const out = integration.processEvent?.(event, {}, makeMockClient()) as TransactionEvent;
      expect(out.spans).toHaveLength(1);
      expect(out.spans?.[0]?.data).toMatchObject({
        'turbo_modules.RNSentry.captureEnvelope.async.count': 1,
      });
    });

    it('captures a periodic event after the configured interval when data is present', () => {
      jest.useFakeTimers();
      const integration = turboModuleContextIntegration();
      integration.setupOnce?.();
      const client = makeMockClient();
      integration.setup?.(client);

      recordTurboModuleCall({ name: 'A', method: 'x', kind: 'sync', durationMs: 1, errored: false });
      jest.advanceTimersByTime(DEFAULT_AGGREGATE_FLUSH_INTERVAL_MS);

      expect(client.captureEvent).toHaveBeenCalledTimes(1);
      expect(client.captureEvent.mock.calls[0]?.[0]).toMatchObject({
        level: 'info',
        tags: { 'event.kind': 'turbo_modules.aggregate' },
      });
    });

    it('does not accumulate aggregate entries when enableAggregateStats is disabled', () => {
      // With aggregation off, wrapped TurboModule calls must not accumulate
      // into the process-wide map — otherwise the opt-out would leak calls
      // for the lifetime of the app (no drain path is armed).
      const integration = turboModuleContextIntegration({ enableAggregateStats: false });
      integration.setupOnce?.();
      integration.setup?.(makeMockClient());

      for (let i = 0; i < 50; i++) {
        recordTurboModuleCall({
          name: 'RNSentry',
          method: 'captureEnvelope',
          kind: 'async',
          durationMs: 3,
          errored: false,
        });
      }

      expect(hasTurboModuleAggregateData()).toBe(false);

      const event = makeTransactionEvent();
      const out = integration.processEvent?.(event, {}, makeMockClient()) as TransactionEvent;
      expect(out.spans ?? []).toHaveLength(0);
      expect(out.measurements ?? {}).toEqual({});
    });
  });

  describe('span attribution', () => {
    let addBreadcrumbSpy: jest.SpyInstance;

    beforeEach(() => {
      jest.spyOn(wrapper, 'getRNSentryModule').mockReturnValue(undefined);
      jest.spyOn(spanUtils, 'isRootSpan').mockReturnValue(true);
      addBreadcrumbSpy = jest.spyOn(SentryCore, 'addBreadcrumb').mockImplementation(() => {});
    });

    it('attaches per-(module, method) attributes to root spans on spanEnd', () => {
      const integration = turboModuleContextIntegration({ aggregateFlushIntervalMs: 0 });
      integration.setupOnce?.();
      const { client, emit } = makeClientWithSpanHooks();
      integration.setup?.(client);

      const span = makeFakeSpan();
      emit('spanStart', span);

      recordTurboModuleCall({ name: 'UserMod', method: 'work', kind: 'async', durationMs: 12, errored: false });
      recordTurboModuleCall({ name: 'UserMod', method: 'work', kind: 'async', durationMs: 8, errored: true });
      recordTurboModuleCall({ name: 'Other', method: 'ping', kind: 'sync', durationMs: 1, errored: false });

      emit('spanEnd', span);

      expect(span.setAttributes).toHaveBeenCalledTimes(1);
      const attributes = span.setAttributes.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(attributes).toMatchObject({
        'turbo_module.UserMod.work.call_count': 2,
        'turbo_module.UserMod.work.duration_ms': 20,
        'turbo_module.UserMod.work.error_count': 1,
        'turbo_module.Other.ping.call_count': 1,
        'turbo_module.total_call_count': 3,
        'turbo_module.total_error_count': 1,
        'turbo_module.top_module': 'UserMod.work',
      });
    });

    it('caps the per-row attribute payload to maxTopModulesPerSpan', () => {
      const integration = turboModuleContextIntegration({
        aggregateFlushIntervalMs: 0,
        maxTopModulesPerSpan: 2,
      });
      integration.setupOnce?.();
      const { client, emit } = makeClientWithSpanHooks();
      integration.setup?.(client);

      const span = makeFakeSpan();
      emit('spanStart', span);

      recordTurboModuleCall({ name: 'A', method: 'x', kind: 'sync', durationMs: 100, errored: false });
      recordTurboModuleCall({ name: 'B', method: 'x', kind: 'sync', durationMs: 50, errored: false });
      recordTurboModuleCall({ name: 'C', method: 'x', kind: 'sync', durationMs: 10, errored: false });

      emit('spanEnd', span);

      const attributes = span.setAttributes.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(attributes['turbo_module.A.x.call_count']).toBe(1);
      expect(attributes['turbo_module.B.x.call_count']).toBe(1);
      expect(attributes['turbo_module.C.x.call_count']).toBeUndefined();
      expect(attributes['turbo_module.total_call_count']).toBe(3);
      expect(attributes['turbo_module.unique_methods']).toBe(3);
    });

    it('credits async calls that started inside the span but settled after it ended', () => {
      const integration = turboModuleContextIntegration({ aggregateFlushIntervalMs: 0 });
      integration.setupOnce?.();
      const { client, emit } = makeClientWithSpanHooks();
      integration.setup?.(client);

      const span = makeFakeSpan();
      emit('spanStart', span);

      // Async call starts during the span, settles after — mirrors what
      // `wrapTurboModule` does when a promise-returning method is invoked.
      const recordId = notifyTurboModuleCallStart('Late', 'load', 'async');
      emit('spanEnd', span);
      recordTurboModuleCall({ name: 'Late', method: 'load', kind: 'async', durationMs: 42, errored: false, recordId });

      // Only the late record has data — spanEnd's best-effort attach is a
      // no-op with nothing to serialise. The record's own attach carries it.
      expect(span.setAttributes).toHaveBeenCalledTimes(1);
      const attributes = span.setAttributes.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(attributes['turbo_module.Late.load.call_count']).toBe(1);
      expect(attributes['turbo_module.Late.load.duration_ms']).toBe(42);
    });

    it('does not credit a later span for an async call that started before any span was open', () => {
      const integration = turboModuleContextIntegration({ aggregateFlushIntervalMs: 0 });
      integration.setupOnce?.();
      const { client, emit } = makeClientWithSpanHooks();
      integration.setup?.(client);

      // Async call starts with no span open — snapshot must capture "no
      // windows" rather than nothing.
      const recordId = notifyTurboModuleCallStart('Boot', 'init', 'async');

      // Span opens *after* the call started.
      const span = makeFakeSpan();
      emit('spanStart', span);

      // Call settles into the recordObserver — must not credit `span`.
      recordTurboModuleCall({ name: 'Boot', method: 'init', kind: 'async', durationMs: 10, errored: false, recordId });

      emit('spanEnd', span);

      expect(span.setAttributes).not.toHaveBeenCalled();
    });

    it('clears stale per-method keys on re-emit after a late-settling async re-ranks the top-N', () => {
      const integration = turboModuleContextIntegration({
        aggregateFlushIntervalMs: 0,
        maxTopModulesPerSpan: 2,
      });
      integration.setupOnce?.();
      const { client, emit } = makeClientWithSpanHooks();
      integration.setup?.(client);

      const span = makeFakeSpan();
      emit('spanStart', span);

      // A and B fit within maxTopModulesPerSpan=2 at spanEnd.
      recordTurboModuleCall({ name: 'A', method: 'x', kind: 'sync', durationMs: 100, errored: false });
      recordTurboModuleCall({ name: 'B', method: 'x', kind: 'sync', durationMs: 50, errored: false });

      // Async C starts before spanEnd so it captures the window and can credit
      // it after spanEnd via `pendingCallWindows`.
      const recordId = notifyTurboModuleCallStart('C', 'x', 'async');
      emit('spanEnd', span);

      // Late-settling async C outweighs B and takes B's slot in the top-2.
      // Without clearing, B's stale per-method keys would linger on the span
      // because `setAttributes` merges.
      recordTurboModuleCall({
        name: 'C',
        method: 'x',
        kind: 'async',
        durationMs: 1000,
        errored: false,
        recordId,
      });

      expect(span.setAttributes).toHaveBeenCalledTimes(2);
      const secondCall = span.setAttributes.mock.calls[1]?.[0] as Record<string, unknown>;
      // The re-emit must explicitly pass undefined for B's per-method keys so
      // the merge clears them from the span. Use array form of toHaveProperty
      // to match keys that contain dots.
      expect(secondCall).toHaveProperty(['turbo_module.B.x.call_count'], undefined);
      expect(secondCall).toHaveProperty(['turbo_module.B.x.duration_ms'], undefined);
      expect(secondCall).toHaveProperty(['turbo_module.B.x.error_count'], undefined);
      // Top-2 now reflects C and A.
      expect(secondCall['turbo_module.C.x.duration_ms']).toBe(1000);
      expect(secondCall['turbo_module.A.x.call_count']).toBe(1);
    });

    it('caps pendingCallWindows so unresolved async calls do not leak', () => {
      const integration = turboModuleContextIntegration({ aggregateFlushIntervalMs: 0 });
      integration.setupOnce?.();
      const { client, emit } = makeClientWithSpanHooks();
      integration.setup?.(client);

      const span = makeFakeSpan();
      emit('spanStart', span);

      // Start MAX_PENDING_CALL_WINDOWS + 1 async calls. The very first entry
      // must be evicted (oldest-first eviction).
      const firstRecordId = notifyTurboModuleCallStart('First', 'work', 'async');
      const fillerIds: number[] = [];
      for (let i = 0; i < MAX_PENDING_CALL_WINDOWS; i++) {
        fillerIds.push(notifyTurboModuleCallStart('Filler', `m${i}`, 'async'));
      }

      // Settle a filler so its window credit lands on the span — this drives
      // `attachWindowToSpan` on `spanEnd` and gives us setAttributes calls to
      // inspect below.
      const survivor = fillerIds[0];
      if (survivor !== undefined) {
        recordTurboModuleCall({
          name: 'Filler',
          method: 'm0',
          kind: 'async',
          durationMs: 3,
          errored: false,
          recordId: survivor,
        });
      }

      // Settle the evicted first call — its pending window entry is gone, so
      // it must NOT credit `span`.
      recordTurboModuleCall({
        name: 'First',
        method: 'work',
        kind: 'async',
        durationMs: 5,
        errored: false,
        recordId: firstRecordId,
      });

      emit('spanEnd', span);

      // spanEnd must have flushed the window at least once, and none of the
      // resulting payloads may contain the evicted `First.work` row.
      expect(span.setAttributes.mock.calls.length).toBeGreaterThan(0);
      for (const [attributes] of span.setAttributes.mock.calls) {
        expect(attributes['turbo_module.First.work.call_count']).toBeUndefined();
      }
      // The surviving filler *did* get credited — that's the positive control
      // that keeps this test from silently passing on an empty payload.
      const lastCall = span.setAttributes.mock.calls.at(-1)?.[0] as Record<string, unknown>;
      expect(lastCall['turbo_module.Filler.m0.call_count']).toBe(1);
    });

    it('merges the latest attribute payload onto the transaction event via processEvent', () => {
      // The Sentry SDK freezes a span at `.end()`, so a late-settling async
      // record after `spanEnd` can't reach the transaction through
      // `span.setAttributes` alone. The integration also buffers the payload
      // by span_id and merges it into `event.contexts.trace.data` on the
      // paired transaction event — this test drives that path.
      const integration = turboModuleContextIntegration({ aggregateFlushIntervalMs: 0 });
      integration.setupOnce?.();
      const { client, emit } = makeClientWithSpanHooks();
      integration.setup?.(client);

      const span = makeFakeSpan({ spanId: 'root-1' });
      emit('spanStart', span);

      const recordId = notifyTurboModuleCallStart('Late', 'load', 'async');
      emit('spanEnd', span);
      recordTurboModuleCall({
        name: 'Late',
        method: 'load',
        kind: 'async',
        durationMs: 42,
        errored: false,
        recordId,
      });

      const event = makeTransactionEvent({
        contexts: { trace: { trace_id: 'a'.repeat(32), span_id: 'root-1' } },
      });
      const out = integration.processEvent?.(event, {}, makeMockClient()) as TransactionEvent;
      const data = out.contexts?.trace?.data as Record<string, unknown> | undefined;

      expect(data).toBeDefined();
      expect(data?.['turbo_module.Late.load.call_count']).toBe(1);
      expect(data?.['turbo_module.Late.load.duration_ms']).toBe(42);
      expect(data?.['turbo_module.total_call_count']).toBe(1);
    });

    it('does not overwrite pre-existing trace.data keys when merging', () => {
      const integration = turboModuleContextIntegration({ aggregateFlushIntervalMs: 0 });
      integration.setupOnce?.();
      const { client, emit } = makeClientWithSpanHooks();
      integration.setup?.(client);

      const span = makeFakeSpan({ spanId: 'root-2' });
      emit('spanStart', span);
      recordTurboModuleCall({ name: 'Mod', method: 'op', kind: 'sync', durationMs: 1, errored: false });
      emit('spanEnd', span);

      const event = makeTransactionEvent({
        contexts: {
          trace: {
            trace_id: 'a'.repeat(32),
            span_id: 'root-2',
            data: { 'existing.key': 'kept' },
          },
        },
      });
      const out = integration.processEvent?.(event, {}, makeMockClient()) as TransactionEvent;
      const data = out.contexts?.trace?.data as Record<string, unknown>;

      expect(data['existing.key']).toBe('kept');
      expect(data['turbo_module.Mod.op.call_count']).toBe(1);
    });

    it('escapes dots in module and method names so distinct pairs never collapse', () => {
      // `(name="a.b", method="c")` and `(name="a", method="b.c")` would both
      // produce `turbo_module.a.b.c.*` without escaping and overwrite each
      // other in the attribute payload.
      const integration = turboModuleContextIntegration({ aggregateFlushIntervalMs: 0 });
      integration.setupOnce?.();
      const { client, emit } = makeClientWithSpanHooks();
      integration.setup?.(client);

      const span = makeFakeSpan();
      emit('spanStart', span);
      recordTurboModuleCall({ name: 'a.b', method: 'c', kind: 'sync', durationMs: 5, errored: false });
      recordTurboModuleCall({ name: 'a', method: 'b.c', kind: 'sync', durationMs: 7, errored: false });
      emit('spanEnd', span);

      const attributes = span.setAttributes.mock.calls[0]?.[0] as Record<string, unknown>;
      // Two distinct keys must survive — no collision.
      expect(attributes['turbo_module.a_b.c.call_count']).toBe(1);
      expect(attributes['turbo_module.a.b_c.call_count']).toBe(1);
      expect(attributes['turbo_module.unique_methods']).toBe(2);
    });

    it('does not attach attributes to non-root spans', () => {
      (spanUtils.isRootSpan as jest.Mock).mockReturnValue(false);

      const integration = turboModuleContextIntegration({ aggregateFlushIntervalMs: 0 });
      integration.setupOnce?.();
      const { client, emit } = makeClientWithSpanHooks();
      integration.setup?.(client);

      const span = makeFakeSpan();
      emit('spanStart', span);
      recordTurboModuleCall({ name: 'A', method: 'x', kind: 'sync', durationMs: 1, errored: false });
      emit('spanEnd', span);

      expect(span.setAttributes).not.toHaveBeenCalled();
    });

    it('is inert when enableSpanAttribution is disabled', () => {
      const integration = turboModuleContextIntegration({
        aggregateFlushIntervalMs: 0,
        enableSpanAttribution: false,
      });
      integration.setupOnce?.();
      const { client, handlers } = makeClientWithSpanHooks();
      integration.setup?.(client);

      expect(handlers.has('spanStart')).toBe(false);
      expect(handlers.has('spanEnd')).toBe(false);
    });

    it('emits a native.turbo_module breadcrumb for async calls exceeding the threshold', () => {
      const integration = turboModuleContextIntegration({ aggregateFlushIntervalMs: 0 });
      integration.setupOnce?.();
      const { client } = makeClientWithSpanHooks();
      integration.setup?.(client);

      recordTurboModuleCall({
        name: 'Slow',
        method: 'blocking',
        kind: 'async',
        durationMs: DEFAULT_SLOW_CALL_THRESHOLD_MS + 50,
        errored: false,
      });

      expect(addBreadcrumbSpy).toHaveBeenCalledTimes(1);
      const breadcrumb = addBreadcrumbSpy.mock.calls[0]?.[0];
      expect(breadcrumb).toMatchObject({
        category: TURBO_MODULE_BREADCRUMB_CATEGORY,
        level: 'info',
        data: expect.objectContaining({ module: 'Slow', method: 'blocking', kind: 'async' }),
      });
    });

    it('does not emit a breadcrumb below the threshold or for sync calls', () => {
      const integration = turboModuleContextIntegration({ aggregateFlushIntervalMs: 0 });
      integration.setupOnce?.();
      const { client } = makeClientWithSpanHooks();
      integration.setup?.(client);

      recordTurboModuleCall({
        name: 'Fast',
        method: 'noop',
        kind: 'async',
        durationMs: DEFAULT_SLOW_CALL_THRESHOLD_MS - 1,
        errored: false,
      });
      recordTurboModuleCall({
        name: 'SlowSync',
        method: 'block',
        kind: 'sync',
        durationMs: DEFAULT_SLOW_CALL_THRESHOLD_MS + 100,
        errored: false,
      });

      expect(addBreadcrumbSpy).not.toHaveBeenCalled();
    });

    it('emits slow-call breadcrumbs even when enableSpanAttribution is disabled', () => {
      // `slowCallThresholdMs` is documented as an independent knob — turning
      // span attribution off must not silently disable breadcrumbs.
      const integration = turboModuleContextIntegration({
        aggregateFlushIntervalMs: 0,
        enableSpanAttribution: false,
      });
      integration.setupOnce?.();
      const { client } = makeClientWithSpanHooks();
      integration.setup?.(client);

      recordTurboModuleCall({
        name: 'Slow',
        method: 'blocking',
        kind: 'async',
        durationMs: DEFAULT_SLOW_CALL_THRESHOLD_MS + 50,
        errored: false,
      });

      expect(addBreadcrumbSpy).toHaveBeenCalledTimes(1);
    });

    it('does not register the record observer when both span attribution and breadcrumbs are off', () => {
      const integration = turboModuleContextIntegration({
        aggregateFlushIntervalMs: 0,
        enableSpanAttribution: false,
        slowCallThresholdMs: 0,
      });
      integration.setupOnce?.();
      const { client } = makeClientWithSpanHooks();
      integration.setup?.(client);

      // With every per-record surface disabled, a call must be a no-op —
      // no breadcrumb, no attempt to touch a span.
      recordTurboModuleCall({
        name: 'X',
        method: 'y',
        kind: 'async',
        durationMs: DEFAULT_SLOW_CALL_THRESHOLD_MS + 100,
        errored: false,
      });

      expect(addBreadcrumbSpy).not.toHaveBeenCalled();
    });

    it('does not evict async pending entries when sync calls churn through the pending map', () => {
      const integration = turboModuleContextIntegration({ aggregateFlushIntervalMs: 0 });
      integration.setupOnce?.();
      const { client, emit } = makeClientWithSpanHooks();
      integration.setup?.(client);

      const span = makeFakeSpan();
      emit('spanStart', span);

      // A legitimate long-running async call starts and holds a slot.
      const asyncRecordId = notifyTurboModuleCallStart('Long', 'req', 'async');

      // A burst of paired sync notify+record calls (what `wrapTurboModule`
      // does for every wrapped invocation before it knows if the return is
      // thenable). Each entry lives briefly then is removed by the paired
      // record, so the map stays bounded by in-flight async count.
      for (let i = 0; i < MAX_PENDING_CALL_WINDOWS + 5; i++) {
        const syncId = notifyTurboModuleCallStart('SyncBurst', `m${i}`, 'sync');
        recordTurboModuleCall({
          name: 'SyncBurst',
          method: `m${i}`,
          kind: 'sync',
          durationMs: 1,
          errored: false,
          recordId: syncId,
        });
      }

      // `Long` settles after the burst — its window snapshot survived.
      recordTurboModuleCall({
        name: 'Long',
        method: 'req',
        kind: 'async',
        durationMs: 42,
        errored: false,
        recordId: asyncRecordId,
      });
      emit('spanEnd', span);

      const attributes = span.setAttributes.mock.calls.at(-1)?.[0] as Record<string, unknown>;
      expect(attributes['turbo_module.Long.req.call_count']).toBe(1);
      expect(attributes['turbo_module.Long.req.duration_ms']).toBe(42);
    });
  });
});
