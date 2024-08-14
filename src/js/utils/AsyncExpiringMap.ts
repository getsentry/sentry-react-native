/**
 *
 */
export class AsyncExpiringMap<K, V> {
  private _ttl: number;
  private _cleanupIntervalMs: number;
  private _map: Map<K, { value: V | undefined; expiresAt: number | null; promise: PromiseLike<V> | null }>;
  private _cleanupInterval: ReturnType<typeof setInterval>;

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
    this.startCleanup();
  }

  /**
   *
   */
  public set(key: K, promise: PromiseLike<V> | V): void {
    if (!this._cleanupInterval) {
      this.startCleanup();
    }

    if (typeof promise !== 'object' || !('then' in promise)) {
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
   *
   */
  public pop(key: K): PromiseLike<V> | V | undefined {
    const entry = this.get(key);
    this._map.delete(key);
    return entry;
  }

  /**
   *
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
      return undefined;
    }

    return entry.value;
  }

  /**
   *
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
   *
   */
  public ttl(key: K): number | undefined {
    const entry = this._map.get(key);
    if (entry && entry.expiresAt) {
      const remainingTime = entry.expiresAt - Date.now();
      return remainingTime > 0 ? remainingTime : 0;
    }
    return undefined;
  }

  /**
   *
   */
  public cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this._map.entries()) {
      if (entry.expiresAt && entry.expiresAt <= now) {
        this._map.delete(key);
      }
    }
    const size = this._map.size;
    if (size) {
      this.stopCleanup();
    }
  }

  /**
   *
   */
  public clear(): void {
    clearInterval(this._cleanupInterval);
    this._map.clear();
  }

  /**
   *
   */
  public stopCleanup(): void {
    clearInterval(this._cleanupInterval);
  }

  /**
   *
   */
  public startCleanup(): void {
    this._cleanupInterval = setInterval(() => this.cleanup(), this._cleanupIntervalMs);
  }
}
