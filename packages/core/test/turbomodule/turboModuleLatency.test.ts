/**
 * Micro-benchmark for the JS-side TurboModule instrumentation.
 *
 * `enableTurboModuleTracking` installs the native perf logger; the user-visible
 * per-call cost in JS comes from the wrapper `wrapTurboModule` installs on each
 * TurboModule method (scope push/pop + aggregate counters). This measures that
 * wrapper against the exact same module without it, and prints the numbers so
 * they show up in CI output.
 *
 * It deliberately makes no assertion on absolute timings — shared CI runners are
 * far too noisy for that. The only guard is a very generous per-call ceiling that
 * catches pathological regressions (e.g. an accidental O(n) scan per call).
 *
 * See https://github.com/getsentry/sentry-react-native/issues/6167.
 */
import * as SentryCore from '@sentry/core';
import { Scope } from '@sentry/core';

import {
  _resetTurboModuleAggregator,
  setAggregateRecordingEnabled,
} from '../../src/js/turbomodule/turboModuleAggregator';
import { _resetTurboModuleTracker } from '../../src/js/turbomodule/turboModuleTracker';
import { _resetWrappedModules, wrapTurboModule } from '../../src/js/turbomodule/wrapTurboModule';

/** Iterations per measured run. Kept small enough to stay well under the Jest timeout. */
const ITERATIONS = 20_000;
/** Discarded iterations, so JIT warm-up doesn't land in the measured window. */
const WARMUP_ITERATIONS = 2_000;

/**
 * Generous ceiling on the added per-call cost, in microseconds. The wrapper does
 * a handful of map writes per call; anything above this means something is
 * structurally wrong rather than just a slow runner.
 */
const MAX_OVERHEAD_US_PER_CALL = 100;

interface SyncModule {
  add: (a: number, b: number) => number;
}

interface AsyncModule {
  getPlatform: () => Promise<string>;
}

const createSyncModule = (): SyncModule => ({
  add: (a: number, b: number): number => a + b,
});

const createAsyncModule = (): AsyncModule => ({
  getPlatform: (): Promise<string> => Promise.resolve('benchmark'),
});

const nowUs = (): number => Number(process.hrtime.bigint()) / 1_000;

const measureSync = (module: SyncModule, iterations: number): number => {
  let sum = 0;
  const start = nowUs();
  for (let i = 0; i < iterations; i++) {
    sum = module.add(sum, 1);
  }
  const elapsed = nowUs() - start;
  // Consume `sum` so the loop can't be optimised away.
  expect(sum).toBe(iterations);
  return elapsed;
};

const measureAsync = async (module: AsyncModule, iterations: number): Promise<number> => {
  const start = nowUs();
  for (let i = 0; i < iterations; i++) {
    await module.getPlatform();
  }
  return nowUs() - start;
};

interface Row {
  label: string;
  baselineUsPerCall: number;
  trackedUsPerCall: number;
}

const report = (rows: Row[]): void => {
  const lines = rows.map(row => {
    const overhead = row.trackedUsPerCall - row.baselineUsPerCall;
    const factor = row.baselineUsPerCall > 0 ? row.trackedUsPerCall / row.baselineUsPerCall : NaN;
    return (
      `  ${row.label.padEnd(8)} ` +
      `off=${row.baselineUsPerCall.toFixed(3)}us/call ` +
      `on=${row.trackedUsPerCall.toFixed(3)}us/call ` +
      `overhead=${overhead.toFixed(3)}us/call (${factor.toFixed(2)}x)`
    );
  });
  // `test/mockConsole.ts` replaces `console.log`, so write straight to stdout to
  // make sure the numbers reach the CI log.
  process.stdout.write(`\n[benchmark] TurboModule call latency (${ITERATIONS} iterations)\n${lines.join('\n')}\n\n`);
};

describe('TurboModule call latency', () => {
  beforeEach(() => {
    _resetTurboModuleTracker();
    _resetTurboModuleAggregator();
    _resetWrappedModules();
    setAggregateRecordingEnabled(true);
    const scope = new Scope();
    jest.spyOn(SentryCore, 'getIsolationScope').mockReturnValue(scope);
    jest.spyOn(SentryCore, 'getCurrentScope').mockReturnValue(scope);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('adds a bounded per-call overhead for sync and async calls', async () => {
    // Arrange
    const baselineSync = createSyncModule();
    const trackedSync = wrapTurboModule('BenchmarkModule', createSyncModule()) as SyncModule;
    const baselineAsync = createAsyncModule();
    const trackedAsync = wrapTurboModule('BenchmarkAsyncModule', createAsyncModule()) as AsyncModule;

    measureSync(baselineSync, WARMUP_ITERATIONS);
    measureSync(trackedSync, WARMUP_ITERATIONS);
    await measureAsync(baselineAsync, WARMUP_ITERATIONS);
    await measureAsync(trackedAsync, WARMUP_ITERATIONS);

    // Act
    const syncBaselineUs = measureSync(baselineSync, ITERATIONS) / ITERATIONS;
    const syncTrackedUs = measureSync(trackedSync, ITERATIONS) / ITERATIONS;
    const asyncBaselineUs = (await measureAsync(baselineAsync, ITERATIONS)) / ITERATIONS;
    const asyncTrackedUs = (await measureAsync(trackedAsync, ITERATIONS)) / ITERATIONS;

    report([
      { label: 'sync', baselineUsPerCall: syncBaselineUs, trackedUsPerCall: syncTrackedUs },
      { label: 'async', baselineUsPerCall: asyncBaselineUs, trackedUsPerCall: asyncTrackedUs },
    ]);

    // Assert
    expect(syncTrackedUs - syncBaselineUs).toBeLessThan(MAX_OVERHEAD_US_PER_CALL);
    expect(asyncTrackedUs - asyncBaselineUs).toBeLessThan(MAX_OVERHEAD_US_PER_CALL);
  }, 120_000);
});
