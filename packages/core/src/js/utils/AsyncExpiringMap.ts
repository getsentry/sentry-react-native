/**
 * A Map that automatically removes entries after their TTL has expired.
 *
 * The map is Promise-aware, meaning it will start TTL countdown only after the promise has resolved.
 */
export class AsyncExpiringMap<K, V> {
  private _ttl: number;
  private _cleanupIntervalMs: number;
  private _map: Map<K, { value: V | undefined; expiresAt: number | null; promise: PromiseLike<V> | null }>;
  private _cleanupInterval: ReturnType<typeof setInterval> | undefined;

  public constructor({
    cleanupInterval = 5_000,
    ttl = 2_000,
  }: {
    cleanupInterval?: number;
    ttl?: number;
  } = {}) {
    this._ttl = ttl;
    this._map = new Map();
    this._cleanupIntervalMs = cleanupInterval;
    // The cleanup interval is started lazily on the first `set()`. Starting it here would keep the
    // interval (and therefore a Node/Jest process) alive just from importing the module, with nothing to clean.
  }

  /**
   * Set a key-value pair.
   */
  public set(key: K, promise: PromiseLike<V> | V): void {
    if (!this._cleanupInterval) {
      this.startCleanup();
    }

    if (typeof promise !== 'object' || !promise || !('then' in promise)) {
      this._map.set(key, { value: promise, expiresAt: Date.now() + this._ttl, promise: null });
      return;
    }

    const entry: { value: V | undefined; expiresAt: number | null; promise: PromiseLike<V> | null } = {
      value: undefined,
      expiresAt: null,
      promise,
    };
    this._map.set(key, entry);

    promise.then(
      value => {
        entry.value = value;
        entry.expiresAt = Date.now() + this._ttl;
        entry.promise = null;
      },
      () => {
        entry.expiresAt = Date.now() + this._ttl;
        entry.promise = null;
      },
    );
  }

  /**
   * Pops a key-value pair.
   */
  public pop(key: K): PromiseLike<V> | V | undefined {
    const entry = this.get(key);
    this._map.delete(key);
    return entry;
  }

  /**
   * Get a value by key.
   *
   * If the values is expired it will be returned and removed from the map.
   */
  public get(key: K): PromiseLike<V> | V | undefined {
    const entry = this._map.get(key);

    if (!entry) {
      return undefined;
    }

    if (entry.promise) {
      return entry.promise;
    }

    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this._map.delete(key);
    }

    return entry.value;
  }

  /**
   * Check if a key exists in the map.
   *
   * If the key is expired it's not present in the map.
   */
  public has(key: K): boolean {
    const entry = this._map.get(key);

    if (!entry) {
      return false;
    }

    if (entry.promise) {
      return true;
    }

    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this._map.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Get the remaining time to live of a key.
   */
  public ttl(key: K): number | undefined {
    const entry = this._map.get(key);
    if (entry?.expiresAt) {
      const remainingTime = entry.expiresAt - Date.now();
      return remainingTime > 0 ? remainingTime : 0;
    }
    return undefined;
  }

  /**
   * Remove expired entries.
   */
  public cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this._map.entries()) {
      if (entry.expiresAt && entry.expiresAt <= now) {
        this._map.delete(key);
      }
    }
    const size = this._map.size;
    if (!size) {
      this.stopCleanup();
    }
  }

  /**
   * Clear all entries.
   */
  public clear(): void {
    this.stopCleanup();
    this._map.clear();
  }

  /**
   * Stop the cleanup interval.
   */
  public stopCleanup(): void {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      // Reset so `set()` can restart cleanup on demand. Without this the handle stays truthy after being
      // cleared, so `set()` never re-arms the interval and later entries are only evicted lazily on access.
      this._cleanupInterval = undefined;
    }
  }

  /**
   * Start the cleanup interval.
   */
  public startCleanup(): void {
    const interval = setInterval(() => this.cleanup(), this._cleanupIntervalMs);
    // `unref` exists on Node timers (Jest, tests, tooling) but not on the React Native `setInterval` number
    // (typed as `number` here), so access it defensively. It ensures the interval never keeps a Node process
    // alive on its own.
    (interval as unknown as { unref?: () => void }).unref?.();
    this._cleanupInterval = interval;
  }
}
