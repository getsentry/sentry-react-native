import { ensureReliablePerformanceTimeOrigin } from '../../src/js/utils/performanceclock';

describe('ensureReliablePerformanceTimeOrigin', () => {
  const originalPerformance = (globalThis as { performance?: unknown }).performance;
  const NOW = 1_700_000_000_000;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    if (originalPerformance !== undefined) {
      (globalThis as { performance?: unknown }).performance = originalPerformance;
    } else {
      delete (globalThis as { performance?: unknown }).performance;
    }
    jest.restoreAllMocks();
  });

  const setPerformance = (value: unknown): void => {
    (globalThis as { performance?: unknown }).performance = value;
  };

  it('neutralizes timeOrigin and returns the drift when timeOrigin + now() drifts far from Date.now()', () => {
    // timeOrigin + now() = 100 + 1000 = 1100, ~1.7e12 ms behind Date.now(): far past the threshold.
    setPerformance({ now: () => 1000, timeOrigin: 100 });

    const drift = ensureReliablePerformanceTimeOrigin();

    expect((globalThis as { performance: { timeOrigin: number } }).performance.timeOrigin).toBe(0);
    expect(drift).toBe(NOW - 1100);
  });

  it('leaves a healthy timeOrigin untouched and returns undefined', () => {
    // timeOrigin + now() === Date.now(): no drift.
    const timeOrigin = NOW - 5000;
    setPerformance({ now: () => 5000, timeOrigin });

    const drift = ensureReliablePerformanceTimeOrigin();

    expect((globalThis as { performance: { timeOrigin: number } }).performance.timeOrigin).toBe(timeOrigin);
    expect(drift).toBeUndefined();
  });

  it('leaves timeOrigin untouched when drift is within the threshold', () => {
    // 60s of drift, under the 5-minute threshold.
    const timeOrigin = NOW - 5000 - 60_000;
    setPerformance({ now: () => 5000, timeOrigin });

    const drift = ensureReliablePerformanceTimeOrigin();

    expect((globalThis as { performance: { timeOrigin: number } }).performance.timeOrigin).toBe(timeOrigin);
    expect(drift).toBeUndefined();
  });

  it('does nothing when performance is missing', () => {
    delete (globalThis as { performance?: unknown }).performance;

    expect(ensureReliablePerformanceTimeOrigin()).toBeUndefined();
    expect((globalThis as { performance?: unknown }).performance).toBeUndefined();
  });

  it('does nothing when timeOrigin is not a number', () => {
    setPerformance({ now: () => 1000 });

    expect(ensureReliablePerformanceTimeOrigin()).toBeUndefined();
    expect((globalThis as { performance: { timeOrigin?: number } }).performance.timeOrigin).toBeUndefined();
  });

  it('does nothing when now is not a function', () => {
    setPerformance({ timeOrigin: 100 });

    expect(ensureReliablePerformanceTimeOrigin()).toBeUndefined();
    expect((globalThis as { performance: { timeOrigin: number } }).performance.timeOrigin).toBe(100);
  });

  it('returns undefined without throwing when timeOrigin cannot be redefined', () => {
    // A non-configurable `timeOrigin` makes `Object.defineProperty` throw; the guard must swallow it.
    const performance = { now: () => 1000 };
    Object.defineProperty(performance, 'timeOrigin', { configurable: false, value: 100 });
    setPerformance(performance);

    expect(() => ensureReliablePerformanceTimeOrigin()).not.toThrow();
    expect(ensureReliablePerformanceTimeOrigin()).toBeUndefined();
    expect((globalThis as { performance: { timeOrigin: number } }).performance.timeOrigin).toBe(100);
  });
});
