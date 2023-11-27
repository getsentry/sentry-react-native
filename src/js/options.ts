import type { BrowserTransportOptions } from '@sentry/browser/types/transports/types';
import type { ProfilerProps } from '@sentry/react/types/profiler';
import type { CaptureContext, ClientOptions, Options } from '@sentry/types';

import type { TouchEventBoundaryProps } from './touchevents';

export interface BaseReactNativeOptions {
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

  /** Should the native nagger alert be shown or not. */
  enableNativeNagger?: boolean;

  /** Should sessions be tracked to Sentry Health or not. */
  enableAutoSessionTracking?: boolean;

  /** The interval to end a session if the App goes to the background. */
  sessionTrackingIntervalMillis?: number;

  /** Enable NDK on Android
   *
   * @default true
   */
  enableNdk?: boolean;

  /** Enable scope sync from Java to NDK on Android
   * Only has an effect if `enableNdk` is `true`.
   */
  enableNdkScopeSync?: boolean;

  /** When enabled, all the threads are automatically attached to all logged events on Android */
  attachThreads?: boolean;

  /**
   *  When enabled, certain personally identifiable information (PII) is added by active integrations.
   *
   * @default false
   */
  sendDefaultPii?: boolean;

  /**
   * Callback that is called after the RN SDK on the JS Layer has made contact with the Native Layer.
   */
  onReady?: (response: {
    /** `true` if the native SDK has been initialized, `false` otherwise.  */
    didCallNativeInit: boolean;
  }) => void;

  /** Enable auto performance tracking by default. Renamed from `enableAutoPerformanceTracking` in v5. */
  enableAutoPerformanceTracing?: boolean;

  /**
   * Enables Out of Memory Tracking for iOS and macCatalyst.
   * See the following link for more information and possible restrictions:
   * https://docs.sentry.io/platforms/apple/guides/ios/configuration/out-of-memory/
   *
   * Renamed from `enableOutOfMemoryTracking` in v5.
   *
   * @default true
   */
  enableWatchdogTerminationTracking?: boolean;

  /**
   * Set data to the inital scope
   * @deprecated Use `Sentry.configureScope(...)`
   */
  initialScope?: CaptureContext;

  /**
   * When enabled, Sentry will overwrite the global Promise instance to ensure that unhandled rejections are correctly tracked.
   * If you run into issues with Promise polyfills such as `core-js`, make sure you polyfill after Sentry is initialized.
   * Read more at https://docs.sentry.io/platforms/react-native/troubleshooting/#unhandled-promise-rejections
   *
   * When disabled, this option will not disable unhandled rejection tracking. Set `onunhandledrejection: false` on the `ReactNativeErrorHandlers` integration instead.
   *
   * @default true
   */
  patchGlobalPromise?: boolean;

  /**
   * The max cache items for capping the number of envelopes.
   *
   * @default 30
   */
  maxCacheItems?: number;

  /**
   * When enabled, the SDK tracks when the application stops responding for a specific amount of
   * time defined by the `appHangTimeoutInterval` option.
   *
   * iOS only
   *
   * @default true
   */
  enableAppHangTracking?: boolean;

  /**
   * The minimum amount of time an app should be unresponsive to be classified as an App Hanging.
   * The actual amount may be a little longer.
   * Avoid using values lower than 100ms, which may cause a lot of app hangs events being transmitted.
   * Value should be in seconds.
   *
   * iOS only
   *
   * @default 2
   */
  appHangTimeoutInterval?: number;

  /**
   * The max queue size for capping the number of envelopes waiting to be sent by Transport.
   */
  maxQueueSize?: number;

  /**
   * When enabled and a user experiences an error, Sentry provides the ability to take a screenshot and include it as an attachment.
   *
   * @default false
   */
  attachScreenshot?: boolean;

  /**
   * When enabled Sentry includes the current view hierarchy in the error attachments.
   *
   * @default false
   */
  attachViewHierarchy?: boolean;

  /**
   * When enabled, Sentry will capture failed XHR/Fetch requests. This option also enabled HTTP Errors on iOS.
   * [Sentry Android Gradle Plugin](https://docs.sentry.io/platforms/android/configuration/integrations/okhttp/)
   * is needed to capture HTTP Errors on Android.
   *
   * @default false
   */
  enableCaptureFailedRequests?: boolean;
}

export interface ReactNativeTransportOptions extends BrowserTransportOptions {
  /**
   * @deprecated use `maxQueueSize` in the root of the SDK options.
   */
  bufferSize?: number;
}

/**
 * Configuration options for the Sentry ReactNative SDK.
 * @see ReactNativeFrontend for more information.
 */

export interface ReactNativeOptions extends Options<ReactNativeTransportOptions>, BaseReactNativeOptions {}

export interface ReactNativeClientOptions extends ClientOptions<ReactNativeTransportOptions>, BaseReactNativeOptions {}

export interface ReactNativeWrapperOptions {
  /** Props for the root React profiler */
  profilerProps?: ProfilerProps;

  /** Props for the root touch event boundary */
  touchEventBoundaryProps?: TouchEventBoundaryProps;
}
