import {
  _resetTurboModuleAggregator,
  drainTurboModuleAggregate,
  recordTurboModuleCall,
  setIgnoredTurboModules,
} from '../../src/js/turbomodule/turboModuleAggregator';

describe('turboModuleAggregator', () => {
  afterEach(() => {
    _resetTurboModuleAggregator();
  });

  it('aggregates calls under the same (name, method, kind) key and clears on drain', () => {
    recordTurboModuleCall({
      name: 'RNSentry',
      method: 'captureEnvelope',
      kind: 'async',
      durationMs: 12,
      errored: false,
    });
    recordTurboModuleCall({ name: 'RNSentry', method: 'captureEnvelope', kind: 'async', durationMs: 8, errored: true });

    const snapshot = drainTurboModuleAggregate();

    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toMatchObject({
      name: 'RNSentry',
      method: 'captureEnvelope',
      kind: 'async',
      callCount: 2,
      errorCount: 1,
      totalDurationMs: 20,
      maxDurationMs: 12,
    });
    expect(drainTurboModuleAggregate()).toEqual([]);
  });

  it('places durations into the correct histogram bucket', () => {
    // Buckets: <1ms, <5ms, <20ms, <100ms, <500ms, >=500ms
    for (const ms of [0.5, 4, 10, 50, 200, 1000]) {
      recordTurboModuleCall({ name: 'M', method: 'm', kind: 'sync', durationMs: ms, errored: false });
    }

    const [row] = drainTurboModuleAggregate();

    expect(row?.buckets).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('drops calls for modules in the ignore list', () => {
    setIgnoredTurboModules(['RNSentry']);
    recordTurboModuleCall({ name: 'RNSentry', method: 'x', kind: 'sync', durationMs: 1, errored: false });
    recordTurboModuleCall({ name: 'Other', method: 'x', kind: 'sync', durationMs: 1, errored: false });

    const snapshot = drainTurboModuleAggregate();

    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.name).toBe('Other');
  });
});
