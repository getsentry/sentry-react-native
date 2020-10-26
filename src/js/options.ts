import { BrowserOptions } from "@sentry/react";

/**
 * Configuration options for the Sentry ReactNative SDK.
 * @see ReactNativeFrontend for more information.
 */

export interface ReactNativeOptions extends BrowserOptions {
  /**
   * Enables native transport + device info + offline caching.
   * Be careful, disabling this also breaks automatic release setting.
   * This means you have to manage setting the release yourself.
   * Defaults to `true`.
   */
  enableNative?: boolean;

  /**
   * Enables native crashHandling. This only works if `enableNative` is `true`.
   * Defaults to `true`.
   */
  enableNativeCrashHandling?: boolean;

  /** Maximum time to wait to drain the request queue, before the process is allowed to exit. */
  shutdownTimeout?: number;

  /** Should the native nagger alert be shown or not. */
  enableNativeNagger?: boolean;

  /** Should sessions be tracked to Sentry Health or not. */
  enableAutoSessionTracking?: boolean;

  /** The interval to end a session if the App goes to the background. */
  sessionTrackingIntervalMillis?: number;

  /** Enable scope sync from Java to NDK on Android */
  enableNdkScopeSync?: boolean;

  /** When enabled, all the threads are automatically attached to all logged events on Android */
  attachThreads?: boolean;
}
