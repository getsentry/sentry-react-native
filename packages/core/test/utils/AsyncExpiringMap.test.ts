import { AsyncExpiringMap } from '../../src/js/utils/AsyncExpiringMap';

describe('AsyncExpiringMap', () => {
  let now = 0;

  beforeEach(() => {
    jest.useFakeTimers();

    now = 0;
    jest.spyOn(global.performance, 'now').mockImplementation(() => now);
    jest.spyOn(global.Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('retrieves a pending promise correctly', () => {
    const map = new AsyncExpiringMap<string, Promise<string>>();
    const promise = new Promise<string>(resolve => setTimeout(() => resolve('value'), 1000));
    map.set('key1', promise);

    const retrievedValue = map.get('key1');
    expect(retrievedValue).toBe(promise);
  });

  it('retrieves a resolved promise value correctly', async () => {
    const map = new AsyncExpiringMap<string, Promise<string>>();
    const promise = Promise.resolve('value');
    map.set('key1', promise);

    await promise;

    const retrievedValue = map.get('key1');
    expect(retrievedValue).toEqual('value');
  });

  it('removes a resolved promise after TTL', async () => {
    const ttl = 2000;
    const cleanupInterval = ttl / 2;
    const map = new AsyncExpiringMap<string, string>({ ttl, cleanupInterval });

    let resolvePromise: (value: string) => void;
    const promise = new Promise<string>(resolve => {
      resolvePromise = resolve;
    });
    map.set('key2', promise);

    now += ttl;
    jest.advanceTimersByTime(ttl);
    expect(map.get('key2')).toBe(promise);

    resolvePromise('value');
    await promise;

    now += ttl;
    jest.advanceTimersByTime(ttl);

    const retrievedValue = map.get('key2');
    expect(retrievedValue).toBeUndefined();
  });

  it('handles rejected promises without crashing', async () => {
    const cleanupInterval = 1000;
    const ttl = 2000;
    const map = new AsyncExpiringMap<string, string>({ ttl, cleanupInterval });
    const rejectedPromise = Promise.reject('error');

    map.set('key9', rejectedPromise);
    await rejectedPromise.catch(() => {});

    now += ttl;
    jest.advanceTimersByTime(ttl);

    const retrievedValue = map.get('key9');
    expect(retrievedValue).toBeUndefined();
  });

  it('returns expired value if not cleaned up yet', () => {
    const ttl = 2000;
    const cleanupInterval = 2 * ttl;
    const map = new AsyncExpiringMap<string, string>({ ttl, cleanupInterval });

    map.set('key1', 'value1');
    now += ttl;
    jest.advanceTimersByTime(ttl);

    const retrievedValue = map.get('key1');
    expect(retrievedValue).toBe('value1');
  });

  it('has function cleans expired value if not cleaned up yet', () => {
    const ttl = 2000;
    const cleanupInterval = 2 * ttl;
    const map = new AsyncExpiringMap<string, string>({ ttl, cleanupInterval });

    map.set('key1', 'value1');
    now += ttl;
    jest.advanceTimersByTime(ttl);

    const hasKey = map.has('key1');
    expect(hasKey).toBeFalse();

    const retrievedValue = map.get('key1');
    expect(retrievedValue).toBeUndefined();
  });

  it('pop removes a key-value pair', () => {
    const map = new AsyncExpiringMap<string, string>();

    map.set('key1', 'value');
    const retrievedValue = map.pop('key1');
    expect(retrievedValue).toBe('value');

    const hasKeyAfterPop = map.has('key1');
    expect(hasKeyAfterPop).toBeFalse();
  });

  it('does not delete unexpired keys during cleanup', () => {
    const ttl = 5000;
    const map = new AsyncExpiringMap<string, string>({ ttl });

    map.set('key3', 'value3');

    now += 2000;
    jest.advanceTimersByTime(2000);
    map.cleanup();

    const retrievedValue = map.get('key3');
    expect(retrievedValue).toBe('value3');
  });

  it('clears all entries when clear is called', () => {
    const map = new AsyncExpiringMap<string, string>();

    map.set('key4', 'value4');
    map.clear();

    const retrievedValue = map.get('key4');
    expect(retrievedValue).toBeUndefined();
  });

  it('stops cleanup when stopCleanup is called', () => {
    const map = new AsyncExpiringMap<string, string>();

    map.set('key5', 'value5');
    map.stopCleanup();

    now += 10000;
    jest.advanceTimersByTime(10000);
    expect(map.get('key5')).toBe('value5');
  });

  it('restarts cleanup when startCleanup is called', () => {
    const ttl = 2000;
    const cleanupInterval = ttl / 2;
    const map = new AsyncExpiringMap<string, string>({ ttl, cleanupInterval });

    map.set('key6', 'value6');
    map.stopCleanup();

    now += ttl;
    jest.advanceTimersByTime(ttl);
    expect(map.get('key6')).toBe('value6');

    map.startCleanup();
    now += ttl;
    jest.advanceTimersByTime(ttl);

    const retrievedValue = map.get('key6');
    expect(retrievedValue).toBeUndefined();
  });

  it('correctly reports the TTL of an existing entry', () => {
    const ttl = 5000;
    const map = new AsyncExpiringMap<string, string>({ ttl });

    map.set('key7', 'value7');
    now += 2000;
    jest.advanceTimersByTime(2000);

    const remainingTTL = map.ttl('key7');
    expect(remainingTTL).toBeGreaterThan(0);
    expect(remainingTTL).toBeLessThanOrEqual(ttl - 2000);
  });

  it('handles setting non-promise values correctly', () => {
    const map = new AsyncExpiringMap<string, string>();

    map.set('key8', 'value8');
    const retrievedValue = map.get('key8');

    expect(retrievedValue).toBe('value8');
  });

  it('handles multiple entries with different TTLs correctly', () => {
    const cleanupInterval = 1000;
    const ttl = 2000;
    const map = new AsyncExpiringMap<string, string>({ ttl, cleanupInterval });

    map.set('key10', 'value10');
    map.set('key11', 'value11');
    now += ttl;
    jest.advanceTimersByTime(ttl);
    map.set('key12', 'value12');

    expect(map.get('key10')).toBeUndefined(); // Expired
    expect(map.get('key11')).toBeUndefined(); // Expired
    expect(map.get('key12')).toBe('value12'); // Not yet expired
  });
});
