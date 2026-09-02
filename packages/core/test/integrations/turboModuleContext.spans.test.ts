/**
 * Integration-level checks against real `SentrySpan`s (the rest of
 * `turboModuleContext.test.ts` drives the integration through mock clients).
 *
 * This locks in the contract the `samples/react-native` "TurboModule Playground"
 * screen depends on: the `turbo_module.*` attributes are readable off the span
 * as soon as `span.end()` returns, so the sample can render them on device
 * without waiting for the transaction to be sent — and the very same values
 * reach the transaction event.
 *
 * Everything lives in a single test on purpose: `setupOnce` (which installs the
 * module wrappers) is only ever run once per integration name per process, so a
 * second client in the same file would silently leave the modules unwrapped.
 */
import type { Event, Span, TransactionEvent } from '@sentry/core';

import { setCurrentClient, spanToJSON, startNewTrace, startSpanManual } from '@sentry/core';

import { turboModuleContextIntegration } from '../../src/js/integrations/turboModuleContext';
import { _resetTurboModuleAggregator } from '../../src/js/turbomodule/turboModuleAggregator';
import { _resetTurboModuleTracker } from '../../src/js/turbomodule/turboModuleTracker';
import { _resetWrappedModules } from '../../src/js/turbomodule/wrapTurboModule';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';
import { clearAllScopes } from '../testutils';

const SYNC_CALL_COUNT = 5;

describe('turboModuleContextIntegration with real spans', () => {
  beforeEach(() => {
    _resetTurboModuleTracker();
    _resetTurboModuleAggregator();
    _resetWrappedModules();
    clearAllScopes();
  });

  afterEach(() => {
    TestClient.sendEventCalled = undefined;
  });

  it('exposes turbo_module attributes on the ended span and on the transaction event', async () => {
    // Arrange
    const syncModule = { add: (a: number, b: number): number => a + b };
    const asyncModule = { getPlatform: (): Promise<string> => Promise.resolve('test') };

    const client = new TestClient(
      getDefaultTestClientOptions({
        tracesSampleRate: 1.0,
        integrations: [
          turboModuleContextIntegration({
            modules: [
              { name: 'NativeSampleModule', module: syncModule },
              { name: 'NativePlatformSampleModule', module: asyncModule },
            ],
            aggregateFlushIntervalMs: 0,
          }),
        ],
      }),
    );
    setCurrentClient(client);
    client.init();

    // The event goes through the async `_prepareEvent` pipeline, so wait for the
    // send instead of reading `eventQueue` synchronously.
    const sentEvent = new Promise<Event>(resolve => {
      TestClient.sendEventCalled = resolve;
    });

    // Act
    let onSpanData: Record<string, unknown> = {};
    await startNewTrace(async () => {
      await startSpanManual({ name: 'turbo_module.sample', forceTransaction: true }, async (span: Span) => {
        let sum = 0;
        for (let index = 1; index <= SYNC_CALL_COUNT; index++) {
          sum = syncModule.add(sum, index);
        }
        expect(sum).toBe(15);

        await asyncModule.getPlatform();

        span.end();
        // `SentrySpan.end()` emits `spanEnd` — where the integration writes the
        // attributes — before it seals the span, and spans created through the
        // core span API are never sealed at all, so this read sees them.
        onSpanData = (spanToJSON(span).data ?? {}) as Record<string, unknown>;
      });
    });
    const transaction = (await sentEvent) as TransactionEvent;

    // Assert
    const expectedAttributes = {
      'turbo_module.total_call_count': SYNC_CALL_COUNT + 1,
      'turbo_module.total_error_count': 0,
      'turbo_module.unique_methods': 2,
      'turbo_module.NativeSampleModule.add.call_count': SYNC_CALL_COUNT,
      'turbo_module.NativeSampleModule.add.error_count': 0,
      'turbo_module.NativePlatformSampleModule.getPlatform.call_count': 1,
      'turbo_module.NativePlatformSampleModule.getPlatform.error_count': 0,
    };

    expect(onSpanData).toEqual(expect.objectContaining(expectedAttributes));

    expect(transaction.type).toBe('transaction');
    expect(transaction.transaction).toBe('turbo_module.sample');
    expect(transaction.contexts?.trace?.data).toEqual(expect.objectContaining(expectedAttributes));
  });
});
