import {
  _resetTurboModuleAggregator,
  beginSuppressFirstTurboModuleRecordCallback,
  drainTurboModuleAggregate,
  endSuppressFirstTurboModuleRecordCallback,
  hasTurboModuleAggregateData,
  recordTurboModuleCall,
  setAggregateRecordingEnabled,
  setIgnoredTurboModules,
  setOnFirstTurboModuleRecord,
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

  it('does not fire the empty→non-empty callback while suppressed', () => {
    const cb = jest.fn();
    setOnFirstTurboModuleRecord(cb);

    beginSuppressFirstTurboModuleRecordCallback();
    recordTurboModuleCall({
      name: 'RNSentry',
      method: 'captureEnvelope',
      kind: 'async',
      durationMs: 1,
      errored: false,
    });
    expect(cb).not.toHaveBeenCalled();

    endSuppressFirstTurboModuleRecordCallback();
    drainTurboModuleAggregate();
    recordTurboModuleCall({ name: 'User', method: 'work', kind: 'sync', durationMs: 1, errored: false });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('drops all calls while recording is disabled and clears any existing entries', () => {
    // Populate the map first, then disable — the disable path must also
    // evict the existing entries so a subsequent enable/disable cycle
    // doesn't resurface pre-disable data.
    recordTurboModuleCall({ name: 'RNSentry', method: 'x', kind: 'sync', durationMs: 1, errored: false });
    expect(hasTurboModuleAggregateData()).toBe(true);

    setAggregateRecordingEnabled(false);
    expect(hasTurboModuleAggregateData()).toBe(false);

    // Further calls made while disabled must not accumulate — this is what
    // the `enableAggregateStats: false` opt-out relies on to avoid a
    // process-wide memory leak.
    for (let i = 0; i < 100; i++) {
      recordTurboModuleCall({ name: 'RNSentry', method: 'x', kind: 'sync', durationMs: 1, errored: false });
    }
    expect(hasTurboModuleAggregateData()).toBe(false);

    // Re-enabling must restore normal behaviour.
    setAggregateRecordingEnabled(true);
    recordTurboModuleCall({ name: 'RNSentry', method: 'x', kind: 'sync', durationMs: 1, errored: false });
    expect(hasTurboModuleAggregateData()).toBe(true);
  });
});
