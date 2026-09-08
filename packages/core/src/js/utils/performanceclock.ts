import { RN_GLOBAL_OBJ } from './worldwide';

/**
 * Divergence (ms) beyond which `performance.timeOrigin` is considered unreliable.
 * Mirrors the 5-minute guard `@sentry/core`'s `getBrowserTimeOrigin` already
 * applies to the browser time origin, but which is not wired into the span/log
 * timestamp path (`createUnixTimestampInSecondsFunc`).
 */
const TIME_ORIGIN_DRIFT_THRESHOLD_MS = 3e5;

interface PerformanceLike {
  now?: () => number;
  timeOrigin?: number;
}

/**
 * Neutralizes an unreliable `performance.timeOrigin` so `@sentry/core` timestamps
 * spans and logs with `Date.now()` instead of `timeOrigin + performance.now()`.
 *
 * Background (#6630): on iOS with React Native >= 0.86, `performance.now()` is
 * backed by `mach_absolute_time()` while `performance.timeOrigin` is derived from
 * a different clock reference (`std::chrono::steady_clock`) and cached once. The
 * two can diverge by ~device uptime, so `timeOrigin + performance.now()` — which
 * `@sentry/core` uses for span and log timestamps — drifts hours or days into the
 * past. Such payloads are silently dropped during ingestion (the transport still
 * reports HTTP 200), while error events (which use `Date.now()`) are unaffected.
 * Before RN 0.86 the modules exposed no truthy `timeOrigin`, so `@sentry/core`
 * already fell back to `Date.now()`; this restores that behavior when the clock
 * is broken.
 *
 * Must run before the first `@sentry/core` timestamp (it caches the origin on
 * first use), i.e. before `initAndBind`. Because `initAndBind` is also where the
 * debug logger is enabled, this returns the corrected drift instead of logging in
 * place, so the caller can warn once logging is live.
 *
 * Self-gating: only acts when the drift exceeds the threshold, so healthy runtimes
 * (and platforms where the pair is consistent) keep the high-resolution clock.
 *
 * @returns the corrected drift in milliseconds when `timeOrigin` was neutralized,
 * or `undefined` when the clock was left untouched.
 */
export function ensureReliablePerformanceTimeOrigin(): number | undefined {
  const performance = (RN_GLOBAL_OBJ as { performance?: PerformanceLike }).performance;
  if (!performance || typeof performance.now !== 'function' || typeof performance.timeOrigin !== 'number') {
    return undefined;
  }

  const drift = Math.abs(performance.timeOrigin + performance.now() - Date.now());
  if (drift <= TIME_ORIGIN_DRIFT_THRESHOLD_MS) {
    return undefined;
  }

  try {
    // Falsy timeOrigin makes `@sentry/core`'s createUnixTimestampInSecondsFunc gate
    // (`!performance.timeOrigin`) fall back to `dateTimestampInSeconds` (Date.now).
    Object.defineProperty(performance, 'timeOrigin', {
      configurable: true,
      value: 0,
    });
    return drift;
  } catch (_e) {
    return undefined;
  }
}
