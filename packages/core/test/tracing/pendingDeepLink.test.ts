import {
  clearPendingDeepLink,
  consumePendingDeepLink,
  setPendingDeepLink,
  setPendingDeepLinkListener,
} from '../../src/js/tracing/pendingDeepLink';

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

  describe('listener', () => {
    it('is invoked synchronously on every set, with url + timestamp', () => {
      const received: Array<{ url: string; receivedAtMs: number }> = [];
      setPendingDeepLinkListener(link => {
        received.push({ url: link.url, receivedAtMs: link.receivedAtMs });
        return false;
      });

      setPendingDeepLink('myapp://a');
      setPendingDeepLink('myapp://b');

      expect(received.map(r => r.url)).toEqual(['myapp://a', 'myapp://b']);
      expect(received[0]?.receivedAtMs).toBeGreaterThan(0);
    });

    it('skips storage when the listener returns true (already consumed)', () => {
      setPendingDeepLinkListener(() => true);
      setPendingDeepLink('myapp://consumed-by-listener');

      expect(consumePendingDeepLink(1_000)).toBeUndefined();
    });

    it('falls through to storage when the listener returns false', () => {
      setPendingDeepLinkListener(() => false);
      setPendingDeepLink('myapp://stored');

      expect(consumePendingDeepLink(1_000)?.url).toBe('myapp://stored');
    });

    it('can be unregistered with undefined', () => {
      const fn = jest.fn().mockReturnValue(true);
      setPendingDeepLinkListener(fn);
      setPendingDeepLinkListener(undefined);

      setPendingDeepLink('myapp://x');
      expect(fn).not.toHaveBeenCalled();
      expect(consumePendingDeepLink(1_000)?.url).toBe('myapp://x');
    });

    it('clearPendingDeepLink also removes the listener', () => {
      const fn = jest.fn().mockReturnValue(true);
      setPendingDeepLinkListener(fn);
      clearPendingDeepLink();

      setPendingDeepLink('myapp://x');
      expect(fn).not.toHaveBeenCalled();
    });
  });
});
