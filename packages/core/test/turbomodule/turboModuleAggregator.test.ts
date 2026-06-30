import {
  _resetTurboModuleAggregator,
  drainTurboModuleAggregate,
  HISTOGRAM_BUCKET_LABELS,
  hasTurboModuleAggregateData,
  isTurboModuleIgnored,
  recordTurboModuleCall,
  setIgnoredTurboModules,
} from '../../src/js/turbomodule/turboModuleAggregator';

describe('turboModuleAggregator', () => {
  afterEach(() => {
    _resetTurboModuleAggregator();
  });

  describe('recordTurboModuleCall', () => {
    it('aggregates calls under the same (name, method, kind) key', () => {
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
    });

    it('keeps separate buckets for different kinds (sync vs async) of the same method', () => {
      recordTurboModuleCall({
        name: 'RNSentry',
        method: 'captureEnvelope',
        kind: 'sync',
        durationMs: 1,
        errored: false,
      });
      recordTurboModuleCall({
        name: 'RNSentry',
        method: 'captureEnvelope',
        kind: 'async',
        durationMs: 1,
        errored: false,
      });

      const snapshot = drainTurboModuleAggregate();

      expect(snapshot).toHaveLength(2);
      expect(snapshot.map(r => r.kind).sort()).toEqual(['async', 'sync']);
    });

    it('places durations into the correct histogram bucket', () => {
      // Buckets: <1ms, <5ms, <20ms, <100ms, <500ms, >=500ms
      const durations = [0.5, 4, 10, 50, 200, 1000];
      const expectedBuckets = [1, 1, 1, 1, 1, 1];

      for (const ms of durations) {
        recordTurboModuleCall({ name: 'M', method: 'm', kind: 'sync', durationMs: ms, errored: false });
      }

      const [row] = drainTurboModuleAggregate();

      expect(row?.buckets).toEqual(expectedBuckets);
      expect(row?.callCount).toBe(6);
    });

    it('treats negative durations as zero (clock-skew artefact)', () => {
      recordTurboModuleCall({ name: 'M', method: 'm', kind: 'sync', durationMs: -42, errored: false });

      const [row] = drainTurboModuleAggregate();

      expect(row?.totalDurationMs).toBe(0);
      expect(row?.maxDurationMs).toBe(0);
      expect(row?.buckets[0]).toBe(1);
    });

    it('exposes one bucket entry per HISTOGRAM_BUCKET_LABELS', () => {
      recordTurboModuleCall({ name: 'M', method: 'm', kind: 'sync', durationMs: 1, errored: false });
      const [row] = drainTurboModuleAggregate();
      expect(row?.buckets).toHaveLength(HISTOGRAM_BUCKET_LABELS.length);
    });
  });

  describe('drainTurboModuleAggregate', () => {
    it('clears state on drain', () => {
      recordTurboModuleCall({ name: 'M', method: 'm', kind: 'sync', durationMs: 1, errored: false });

      expect(hasTurboModuleAggregateData()).toBe(true);
      drainTurboModuleAggregate();
      expect(hasTurboModuleAggregateData()).toBe(false);
      expect(drainTurboModuleAggregate()).toEqual([]);
    });

    it('returns a defensive copy — mutating the result does not affect the next snapshot', () => {
      // Use a sub-1ms duration so the call lands in bucket[0] (`<1ms`), which
      // we then mutate to verify the defensive copy.
      recordTurboModuleCall({ name: 'M', method: 'm', kind: 'sync', durationMs: 0.5, errored: false });
      const first = drainTurboModuleAggregate();
      // Mutating freed snapshot must not leak into the live store.
      if (first[0]) {
        first[0].callCount = 999;
        first[0].buckets[0] = 999;
      }

      recordTurboModuleCall({ name: 'M', method: 'm', kind: 'sync', durationMs: 0.5, errored: false });
      const second = drainTurboModuleAggregate();

      expect(second[0]?.callCount).toBe(1);
      expect(second[0]?.buckets[0]).toBe(1);
    });
  });

  describe('setIgnoredTurboModules', () => {
    it('drops calls for ignored modules but counts calls for others', () => {
      setIgnoredTurboModules(['RNSentry']);
      recordTurboModuleCall({ name: 'RNSentry', method: 'x', kind: 'sync', durationMs: 1, errored: false });
      recordTurboModuleCall({ name: 'OtherModule', method: 'x', kind: 'sync', durationMs: 1, errored: false });

      const snapshot = drainTurboModuleAggregate();

      expect(snapshot).toHaveLength(1);
      expect(snapshot[0]?.name).toBe('OtherModule');
    });

    it('replaces the previous ignore list rather than merging', () => {
      setIgnoredTurboModules(['A']);
      setIgnoredTurboModules(['B']);

      expect(isTurboModuleIgnored('A')).toBe(false);
      expect(isTurboModuleIgnored('B')).toBe(true);
    });

    it('clears the ignore list when called with undefined', () => {
      setIgnoredTurboModules(['A']);
      setIgnoredTurboModules(undefined);

      expect(isTurboModuleIgnored('A')).toBe(false);
    });
  });
});
