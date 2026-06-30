import type { Client, TransactionEvent } from '@sentry/core';

import { Scope } from '@sentry/core';
import * as SentryCore from '@sentry/core';

import {
  DEFAULT_AGGREGATE_FLUSH_INTERVAL_MS,
  turboModuleContextIntegration,
  TURBO_MODULES_AGGREGATE_OP,
} from '../../src/js/integrations/turboModuleContext';
import * as turboModule from '../../src/js/turbomodule';
import { _resetTurboModuleAggregator, recordTurboModuleCall } from '../../src/js/turbomodule/turboModuleAggregator';
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

  describe('aggregate stats — processEvent flush', () => {
    beforeEach(() => {
      jest.spyOn(wrapper, 'getRNSentryModule').mockReturnValue(undefined);
    });

    it('attaches a turbo_modules.aggregate child span + headline measurements on transaction events', () => {
      const integration = turboModuleContextIntegration({ aggregateFlushIntervalMs: 0 });
      integration.setupOnce?.();
      integration.setup?.(makeMockClient());

      recordTurboModuleCall({
        name: 'RNSentry',
        method: 'captureEnvelope',
        kind: 'async',
        durationMs: 12,
        errored: false,
      });
      recordTurboModuleCall({
        name: 'RNSentry',
        method: 'captureEnvelope',
        kind: 'async',
        durationMs: 8,
        errored: true,
      });

      const event = makeTransactionEvent();
      const out = integration.processEvent?.(event, {}, makeMockClient()) as TransactionEvent;

      expect(out.spans).toHaveLength(1);
      expect(out.spans?.[0]).toMatchObject({
        op: TURBO_MODULES_AGGREGATE_OP,
        trace_id: 'a'.repeat(32),
        parent_span_id: 'b'.repeat(16),
      });
      expect(out.spans?.[0]?.data).toMatchObject({
        'turbo_modules.total_call_count': 2,
        'turbo_modules.total_error_count': 1,
        'turbo_modules.total_duration_ms': 20,
        'turbo_modules.RNSentry.captureEnvelope.async.count': 2,
        'turbo_modules.RNSentry.captureEnvelope.async.error_count': 1,
        'turbo_modules.RNSentry.captureEnvelope.async.total_ms': 20,
      });
      expect(out.measurements).toMatchObject({
        'turbo_modules.call_count': { value: 2, unit: 'none' },
        'turbo_modules.error_count': { value: 1, unit: 'none' },
        'turbo_modules.total_ms': { value: 20, unit: 'millisecond' },
        'turbo_modules.top_module_ms': { value: 20, unit: 'millisecond' },
      });
    });

    it('clears the aggregator after a successful flush', () => {
      const integration = turboModuleContextIntegration({ aggregateFlushIntervalMs: 0 });
      integration.setupOnce?.();
      integration.setup?.(makeMockClient());

      recordTurboModuleCall({ name: 'A', method: 'x', kind: 'sync', durationMs: 1, errored: false });

      const firstEvent = makeTransactionEvent();
      integration.processEvent?.(firstEvent, {}, makeMockClient());
      expect(firstEvent.spans).toHaveLength(1);

      // A subsequent transaction with no calls in between gets nothing.
      const secondEvent = makeTransactionEvent();
      const secondOut = integration.processEvent?.(secondEvent, {}, makeMockClient()) as TransactionEvent;
      expect(secondOut.spans ?? []).toHaveLength(0);
      expect(secondOut.measurements ?? {}).toEqual({});
    });

    it('does not touch non-transaction events', () => {
      const integration = turboModuleContextIntegration({ aggregateFlushIntervalMs: 0 });
      integration.setupOnce?.();
      integration.setup?.(makeMockClient());

      recordTurboModuleCall({ name: 'A', method: 'x', kind: 'sync', durationMs: 1, errored: false });

      const errorEvent = { type: undefined, message: 'oops' } as unknown as TransactionEvent;
      const out = integration.processEvent?.(errorEvent, {}, makeMockClient());
      expect((out as TransactionEvent).spans).toBeUndefined();
      expect((out as TransactionEvent).measurements).toBeUndefined();
    });

    it('no-ops when there is nothing aggregated', () => {
      const integration = turboModuleContextIntegration({ aggregateFlushIntervalMs: 0 });
      integration.setupOnce?.();
      integration.setup?.(makeMockClient());

      const event = makeTransactionEvent();
      const out = integration.processEvent?.(event, {}, makeMockClient()) as TransactionEvent;
      expect(out.spans).toBeUndefined();
      expect(out.measurements).toBeUndefined();
    });

    it('respects ignoreTurboModules — those modules are not counted', () => {
      const integration = turboModuleContextIntegration({
        aggregateFlushIntervalMs: 0,
        ignoreTurboModules: ['RNSentry'],
      });
      integration.setupOnce?.();
      integration.setup?.(makeMockClient());

      recordTurboModuleCall({ name: 'RNSentry', method: 'x', kind: 'sync', durationMs: 1, errored: false });
      recordTurboModuleCall({ name: 'Other', method: 'x', kind: 'sync', durationMs: 1, errored: false });

      const event = makeTransactionEvent();
      const out = integration.processEvent?.(event, {}, makeMockClient()) as TransactionEvent;
      expect(out.spans).toHaveLength(1);
      expect(out.spans?.[0]?.data).toMatchObject({
        'turbo_modules.Other.x.sync.count': 1,
      });
      expect(out.spans?.[0]?.data).not.toHaveProperty('turbo_modules.RNSentry.x.sync.count');
    });

    it('does nothing when enableAggregateStats is false', () => {
      const integration = turboModuleContextIntegration({ enableAggregateStats: false });
      integration.setupOnce?.();
      const client = makeMockClient();
      integration.setup?.(client);

      // No interval started.
      expect(client.on).not.toHaveBeenCalled();

      recordTurboModuleCall({ name: 'A', method: 'x', kind: 'sync', durationMs: 1, errored: false });
      const event = makeTransactionEvent();
      const out = integration.processEvent?.(event, {}, makeMockClient()) as TransactionEvent;
      expect(out.spans).toBeUndefined();
      expect(out.measurements).toBeUndefined();
    });
  });

  describe('aggregate stats — periodic timer flush', () => {
    beforeEach(() => {
      jest.spyOn(wrapper, 'getRNSentryModule').mockReturnValue(undefined);
      jest.useFakeTimers();
    });

    it('captures a periodic event after the configured interval when data is present', () => {
      const integration = turboModuleContextIntegration();
      integration.setupOnce?.();
      const client = makeMockClient();
      integration.setup?.(client);

      recordTurboModuleCall({ name: 'A', method: 'x', kind: 'sync', durationMs: 1, errored: false });

      jest.advanceTimersByTime(DEFAULT_AGGREGATE_FLUSH_INTERVAL_MS);

      expect(client.captureEvent).toHaveBeenCalledTimes(1);
      const capturedEvent = client.captureEvent.mock.calls[0]?.[0];
      expect(capturedEvent).toMatchObject({
        level: 'info',
        tags: { 'event.kind': 'turbo_modules.aggregate' },
      });
      expect(capturedEvent.extra).toMatchObject({
        total_call_count: 1,
        unique_methods: 1,
      });
    });

    it('does not fire captureEvent when there is no data to flush', () => {
      const integration = turboModuleContextIntegration();
      integration.setupOnce?.();
      const client = makeMockClient();
      integration.setup?.(client);

      jest.advanceTimersByTime(DEFAULT_AGGREGATE_FLUSH_INTERVAL_MS);

      expect(client.captureEvent).not.toHaveBeenCalled();
    });

    it('does not start the periodic timer when aggregateFlushIntervalMs is 0', () => {
      const integration = turboModuleContextIntegration({ aggregateFlushIntervalMs: 0 });
      integration.setupOnce?.();
      const client = makeMockClient();
      integration.setup?.(client);

      recordTurboModuleCall({ name: 'A', method: 'x', kind: 'sync', durationMs: 1, errored: false });
      jest.advanceTimersByTime(60_000);

      expect(client.captureEvent).not.toHaveBeenCalled();
    });
  });
});
