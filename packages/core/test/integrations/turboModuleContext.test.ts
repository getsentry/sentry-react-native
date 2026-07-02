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

  describe('aggregate stats', () => {
    beforeEach(() => {
      jest.spyOn(wrapper, 'getRNSentryModule').mockReturnValue(undefined);
    });

    it('attaches a turbo_modules.aggregate child span + headline measurements on transaction finish', () => {
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
      expect(out.spans?.[0]).toMatchObject({ op: TURBO_MODULES_AGGREGATE_OP });
      expect(out.spans?.[0]?.data).toMatchObject({
        'turbo_modules.RNSentry.captureEnvelope.async.count': 2,
        'turbo_modules.RNSentry.captureEnvelope.async.error_count': 1,
        'turbo_modules.RNSentry.captureEnvelope.async.total_ms': 20,
      });
      expect(out.measurements).toMatchObject({
        'turbo_modules.call_count': { value: 2, unit: 'none' },
        'turbo_modules.total_ms': { value: 20, unit: 'millisecond' },
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
  });
});
