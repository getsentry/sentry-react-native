import type { AppStateStatus } from 'react-native';

import { debug } from '@sentry/core';
import { AppState, Platform } from 'react-native';

import { NATIVE } from '../wrapper';

const DEFAULT_DELAY_MS = 1000;

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
 * just before the app backgrounds, and restarts it (in buffer mode) a short
 * delay after the app returns to the foreground - safely outside the
 * watchdog window. See getsentry/sentry-react-native#6701.
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
export function createForegroundReplayGuardState(delayMs: number): ForegroundReplayGuardState {
  let pendingResume = false;
  let resumeTimeout: ReturnType<typeof setTimeout> | null = null;

  function clearPendingResume(): void {
    if (resumeTimeout !== null) {
      clearTimeout(resumeTimeout);
      resumeTimeout = null;
    }
  }

  function handleAppStateChange(state: AppStateStatus): void {
    clearPendingResume();

    if (state === 'background') {
      // Only stop (and later restart) a replay we actually found running. If
      // the user already stopped it themselves, or it was never sampled in,
      // there is nothing to protect and nothing to restart.
      if (!NATIVE.getCurrentReplayId()) {
        pendingResume = false;
        return;
      }

      pendingResume = true;
      NATIVE.stopReplay().then(undefined, (error: unknown) => {
        debug.error('[Sentry] Failed to stop replay before backgrounding', error);
      });
      return;
    }

    if (state === 'active' && pendingResume) {
      pendingResume = false;
      resumeTimeout = setTimeout(() => {
        resumeTimeout = null;
        NATIVE.startReplayBuffering().then(undefined, (error: unknown) => {
          debug.error('[Sentry] Failed to restart replay after returning to the foreground', error);
        });
      }, delayMs);
    }
  }

  function detach(): void {
    clearPendingResume();
    pendingResume = false;
  }

  return { handleAppStateChange, detach };
}

/**
 * Wires {@link createForegroundReplayGuardState} to React Native's `AppState`.
 * iOS-only; a no-op everywhere else.
 */
export function attachForegroundReplayGuard(delayMs: number = DEFAULT_DELAY_MS): () => void {
  if (Platform.OS !== 'ios' || !AppState?.isAvailable) {
    return () => {};
  }

  const { handleAppStateChange, detach } = createForegroundReplayGuardState(delayMs);
  const subscription = AppState.addEventListener('change', handleAppStateChange);

  return () => {
    detach();
    subscription?.remove?.();
  };
}
