import type { Integration, ReplayRecordingMode } from '@sentry/core';

// Based on Replay Class https://github.com/getsentry/sentry-javascript/blob/e00cb04f1bbf494067cd8475d392266ba296987a/packages/replay-internal/src/integration.ts#L50

/**
 * Common interface for React Native Replay integrations.
 *
 * Both browser and mobile replay integrations implement this interface so users
 * can control the replay with the same API regardless of platform.
 *
 * The shape mirrors the native (iOS/Android) Session Replay runtime controls.
 * On Web, `pause()` and `resume()` are no-ops (logged) because the browser
 * Session Replay SDK does not expose them; every other method is fully
 * supported on all platforms.
 */
export interface Replay extends Integration {
  /**
   * Start a replay regardless of sampling rate. Calling this will always
   * create a new session. Does nothing if a replay is already recording.
   */
  start(): void;

  /**
   * Start replay buffering. Buffers until `flush()` is called or, if
   * `replaysOnErrorSampleRate` > 0, until an error occurs.
   */
  startBuffering(): void;

  /**
   * Stop the current replay. A subsequent `start()` creates a fresh replay
   * session.
   */
  stop(): Promise<void>;

  /**
   * Pause the current replay. Recording stays paused across background/
   * foreground transitions and automatic restarts until `resume()` is called.
   *
   * @note No-op on Web (logged) - the browser Session Replay SDK does not
   * expose pause/resume.
   */
  pause(): void;

  /**
   * Resume a replay paused with `pause()`.
   *
   * @note No-op on Web (logged) - the browser Session Replay SDK does not
   * expose pause/resume.
   */
  resume(): void;

  /**
   * Flush the current replay data to Sentry, or start a full-session replay if
   * recording is stopped.
   */
  flush(options?: { continueRecording?: boolean }): Promise<void>;

  /**
   * Get the current replay (session) ID, or a nullish value if no replay is
   * active.
   */
  getReplayId(): string | undefined | null;

  /**
   * Get the current recording mode (`'session'` or `'buffer'`), or `undefined`
   * if no replay is active.
   *
   * @note Web only. The browser Session Replay integration exposes this; the
   * mobile integrations do not implement it, so it is optional on the shared
   * interface.
   */
  getRecordingMode?(): ReplayRecordingMode | undefined;
}
