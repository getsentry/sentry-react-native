import type { Client } from '@sentry/core';
import type { AppStateStatus } from 'react-native';

import { debug } from '@sentry/core';
import { AppState, Platform } from 'react-native';

// iOS may suspend the JS runtime between 'inactive' and 'background', so
// 'background' can arrive late or not at all while the app is still
// responsive. Mirrors the same fallback pattern (and delay) as
// `cancelInBackground` in `../tracing/onSpanEndUtils.ts`: on 'inactive',
// schedule the action after a delay, cancelable by a subsequent 'active'.
const IOS_INACTIVE_STOP_DELAY_MS = 5_000;

/**
 * The native calls this guard needs. Callers must invalidate their own cached
 * replay id inside `stopReplay`/`startReplayBuffering` - this module has no
 * knowledge of that cache.
 */
export interface ForegroundReplayGuardDependencies {
  getCurrentReplayId: () => string | null;
  stopReplay: () => Promise<void>;
  startReplayBuffering: () => Promise<void>;
}

/**
 * On iOS, sentry-cocoa resumes Session Replay capture synchronously on
 * `UIApplicationDidBecomeActiveNotification`. On a heavy view hierarchy this
 * can block the main thread past iOS's foreground-transition watchdog and get
 * the app killed (`Fatal App Hang Fully Blocked`).
 *
 * There is no way to prevent that automatic resume from JS: it calls the same
 * shared `pause`/`resume` state that our own `pauseReplay`/`resumeReplay`
 * bridge calls do, so a manual `pause()` before backgrounding does not stick
 * - the native resume unconditionally re-arms capture regardless of it.
 *
 * `stopReplay()` is different: it tears down the native replay session
 * entirely, so the automatic resume becomes a no-op. This guard stops replay
 * before the app backgrounds, and restarts it (in buffer mode) a short delay
 * after the app returns to the foreground - safely outside the watchdog
 * window. See getsentry/sentry-react-native#6701.
 */
export interface ForegroundReplayGuardState {
  handleAppStateChange: (state: AppStateStatus) => void;
  detach: () => void;
}

/**
 * Builds the guard's state machine without touching `AppState`, so tests can
 * drive `handleAppStateChange` directly instead of going through React
 * Native's `AppState` emitter.
 */
export function createForegroundReplayGuardState(
  delayMs: number,
  deps: ForegroundReplayGuardDependencies,
): ForegroundReplayGuardState {
  // True whenever we don't currently trust a guarded replay is running: from
  // a successful stop until a restart successfully completes, or after a
  // stop/restart attempt failed and native state became unknown.
  let stoppedByGuard = false;
  // True while a scheduled restart's `startReplayBuffering()` call is in
  // flight, so a background event that lands mid-restart can mark itself
  // instead of missing the new (unprotected) session entirely.
  let restartInFlight = false;
  let backgroundedDuringRestart = false;
  let detached = false;
  // The in-flight `stopReplay()` call, if any. `restart()` waits for it so a
  // slow stop can never overlap with `startReplayBuffering()` - the fixed
  // delay alone isn't a guarantee.
  let pendingStop: Promise<unknown> | null = null;
  let inactiveStopTimeout: ReturnType<typeof setTimeout> | null = null;
  let resumeTimeout: ReturnType<typeof setTimeout> | null = null;

  function clearInactiveStopTimeout(): void {
    if (inactiveStopTimeout !== null) {
      clearTimeout(inactiveStopTimeout);
      inactiveStopTimeout = null;
    }
  }

  function clearResumeTimeout(): void {
    if (resumeTimeout !== null) {
      clearTimeout(resumeTimeout);
      resumeTimeout = null;
    }
  }

  function stopIfNeeded(): void {
    if (detached) {
      return;
    }
    if (restartInFlight) {
      // A restart is already underway; stop the just-started session once it
      // settles instead of leaving it unprotected.
      backgroundedDuringRestart = true;
      return;
    }
    if (stoppedByGuard) {
      return;
    }
    // Only stop (and later restart) a replay we actually found running. If
    // the user already stopped it themselves, or it was never sampled in,
    // there is nothing to protect and nothing to restart.
    if (!deps.getCurrentReplayId()) {
      return;
    }

    stoppedByGuard = true;
    pendingStop = deps.stopReplay().then(undefined, (error: unknown) => {
      // Native state is unknown after a failed stop - don't act as if it's guarded.
      stoppedByGuard = false;
      debug.error('[Sentry] Failed to stop replay before backgrounding', error);
    });
  }

  function restart(): void {
    restartInFlight = true;
    // Wait for any in-flight stop to actually settle first - startReplayBuffering()
    // must never overlap with a still-running stopReplay() call. `pendingStop`
    // always resolves (its own rejection handler never rethrows).
    Promise.resolve(pendingStop)
      .then(() => deps.startReplayBuffering())
      .then(
        () => {
          restartInFlight = false;
          stoppedByGuard = false;
          if (backgroundedDuringRestart && !detached) {
            backgroundedDuringRestart = false;
            stopIfNeeded();
          }
        },
        (error: unknown) => {
          restartInFlight = false;
          backgroundedDuringRestart = false;
          debug.error('[Sentry] Failed to restart replay after returning to the foreground', error);
        },
      );
  }

  function handleAppStateChange(state: AppStateStatus): void {
    if (state === 'background') {
      clearInactiveStopTimeout();
      clearResumeTimeout();
      stopIfNeeded();
      return;
    }

    if (state === 'inactive') {
      if (Platform.OS === 'ios' && inactiveStopTimeout === null) {
        inactiveStopTimeout = setTimeout(() => {
          inactiveStopTimeout = null;
          stopIfNeeded();
        }, IOS_INACTIVE_STOP_DELAY_MS);
      }
      return;
    }

    if (state === 'active') {
      clearInactiveStopTimeout();
      if (stoppedByGuard && resumeTimeout === null && !restartInFlight) {
        resumeTimeout = setTimeout(() => {
          resumeTimeout = null;
          restart();
        }, delayMs);
      }
    }
  }

  function detach(): void {
    detached = true;
    clearInactiveStopTimeout();
    clearResumeTimeout();
  }

  return { handleAppStateChange, detach };
}

/**
 * Wires {@link createForegroundReplayGuardState} to React Native's `AppState`.
 * iOS-only; a no-op everywhere else.
 */
export function attachForegroundReplayGuard(delayMs: number, deps: ForegroundReplayGuardDependencies): () => void {
  if (Platform.OS !== 'ios' || !AppState?.isAvailable) {
    return () => {};
  }

  const { handleAppStateChange, detach } = createForegroundReplayGuardState(delayMs, deps);
  const subscription = AppState.addEventListener('change', handleAppStateChange);

  return () => {
    detach();
    subscription?.remove?.();
  };
}

/**
 * The native replay bridge calls the guard needs. Passed by reference (e.g.
 * the `NATIVE` singleton) - never spread/destructured, since its methods rely
 * on their receiver (`this.enableNative`, etc.) to read live state.
 */
export interface ForegroundReplayGuardNativeControls {
  getCurrentReplayId: () => string | null;
  stopReplay: () => Promise<void>;
  startReplayBuffering: () => Promise<void>;
}

/**
 * Attaches the guard to `client`, composing `native`'s calls with
 * `invalidateCachedReplayId` (the cache invalidation only the integration
 * knows how to do), and detaches it when the client closes.
 */
export function setupForegroundReplayGuard(
  client: Client,
  delayMs: number = 1000,
  native: ForegroundReplayGuardNativeControls,
  invalidateCachedReplayId: () => void,
): void {
  const detach = attachForegroundReplayGuard(delayMs, {
    getCurrentReplayId: () => native.getCurrentReplayId(),
    stopReplay: () =>
      native.stopReplay().then(invalidateCachedReplayId, (error: unknown) => {
        invalidateCachedReplayId();
        throw error;
      }),
    startReplayBuffering: () => native.startReplayBuffering().then(invalidateCachedReplayId),
  });
  client.on('close', detach);
}
