import { clearPendingDeepLink, consumePendingDeepLink, setPendingDeepLink } from '../../src/js/tracing/pendingDeepLink';

describe('pendingDeepLink', () => {
  afterEach(() => {
    clearPendingDeepLink();
  });

  it('returns undefined when no deep link has been set', () => {
    expect(consumePendingDeepLink(1_000)).toBeUndefined();
  });

  it('returns the most recently stored URL with a receive timestamp', () => {
    const before = Date.now();
    setPendingDeepLink('myapp://profile/123');
    const after = Date.now();

    const pending = consumePendingDeepLink(1_000);
    expect(pending?.url).toBe('myapp://profile/123');
    expect(pending?.receivedAtMs).toBeGreaterThanOrEqual(before);
    expect(pending?.receivedAtMs).toBeLessThanOrEqual(after);
  });

  it('clears the value after a single consume', () => {
    setPendingDeepLink('myapp://a');
    expect(consumePendingDeepLink(1_000)?.url).toBe('myapp://a');
    expect(consumePendingDeepLink(1_000)).toBeUndefined();
  });

  it('overwrites a previous pending value', () => {
    setPendingDeepLink('myapp://old');
    setPendingDeepLink('myapp://new');
    expect(consumePendingDeepLink(1_000)?.url).toBe('myapp://new');
  });

  it('drops values older than maxAgeMs and still clears the slot', () => {
    const originalNow = Date.now;
    const baseNow = originalNow();
    Date.now = (): number => baseNow;
    setPendingDeepLink('myapp://stale');
    Date.now = (): number => baseNow + 5_000;

    try {
      expect(consumePendingDeepLink(1_000)).toBeUndefined();
      // Slot must be empty even though the value was rejected.
      Date.now = originalNow;
      expect(consumePendingDeepLink(1_000)).toBeUndefined();
    } finally {
      Date.now = originalNow;
    }
  });

  it('clearPendingDeepLink removes the value without returning it', () => {
    setPendingDeepLink('myapp://x');
    clearPendingDeepLink();
    expect(consumePendingDeepLink(1_000)).toBeUndefined();
  });
});
