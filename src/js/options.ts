import { BrowserOptions } from "@sentry/react";
import { ProfilerProps } from "@sentry/react/dist/profiler";

import { TouchEventBoundaryProps } from "./touchevents";

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

  /**
   * Initializes the native SDK on init.
   * Set this to `false` if you have an existing native SDK and don't want to re-initialize.
   *
   * NOTE: Be careful and only use this if you know what you are doing.
   * If you use this flag, make sure a native SDK is running before the JS Engine initializes or events might not be captured.
   * Also, make sure the DSN on both the React Native side and the native side are the same one.
   * We strongly recommend checking the documentation if you need to use this.
   *
   * @default true
   */
  autoInitializeNativeSdk?: boolean;

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

  /**
   *  When enabled, certain personally identifiable information (PII) is added by active integrations.
   *
   * @default false
   * */
  sendDefaultPii?: boolean;

  /**
   * Callback that is called after the RN SDK on the JS Layer has made contact with the Native Layer.
   */
  onReady?: (response: {
    /** `true` if the native SDK has been initialized, `false` otherwise.  */
    didCallNativeInit: boolean;
  }) => void;

  /** Enable auto performance tracking by default. */
  enableAutoPerformanceTracking?: boolean;
}

export interface ReactNativeWrapperOptions extends ReactNativeOptions {
  /** Props for the root React profiler */
  profilerProps?: ProfilerProps;

  /** Props for the root touch event boundary */
  touchEventBoundaryProps?: TouchEventBoundaryProps;
}
