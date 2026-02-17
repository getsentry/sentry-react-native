import type { makeFetchTransport } from '@sentry/browser';
import type { CaptureContext, ClientOptions, Event, EventHint, Options } from '@sentry/core';
import type { BrowserOptions, Profiler } from '@sentry/react';
import type * as React from 'react';
import { Platform } from 'react-native';
import type { TouchEventBoundaryProps } from './touchevents';
import { isExpoGo } from './utils/environment';

type ProfilerProps = React.ComponentProps<typeof Profiler>;
type BrowserTransportOptions = Parameters<typeof makeFetchTransport>[0];

type BrowserExperiments = NonNullable<BrowserOptions['_experiments']>;
type SharedExperimentsSubset = BrowserExperiments;

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
   * @platform android
   */
  enableNdk?: boolean;

  /** Enable scope sync from Java to NDK on Android
   * Only has an effect if `enableNdk` is `true`.
   *
   * @platform android
   */
  enableNdkScopeSync?: boolean;

  /**
   * When enabled, all the threads are automatically attached to all logged events on Android
   *
   * @platform android
   */
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
   * @platform ios
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
   * @platform ios
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
   * @platform ios
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

  /**
   * If you use Spotlight by Sentry during development, use
   * this option to forward captured Sentry events to Spotlight.
   *
   * Either set it to true, or provide a specific Spotlight Sidecar URL.
   *
   * More details: https://spotlightjs.com/
   *
   * NOTE: Spotlight is automatically disabled in production builds (when __DEV__ is false).
   * If you need Spotlight in non-development environments, you must manually add
   * spotlightIntegration() to your integrations array. However, this is not recommended
   * as Spotlight requires a local Sidecar server and is designed for development only.
   */
  spotlight?: boolean | string;

  /**
   * Sets a callback which is executed before capturing screenshots. Only
   * relevant if `attachScreenshot` is set to true. When false is returned
   * from the function, no screenshot will be attached.
   */
  beforeScreenshot?: (event: Event, hint: EventHint) => boolean;

  /**
   * Track the app start time by adding measurements to the first route transaction. If there is no routing instrumentation
   * an app start transaction will be started.
   *
   * Requires performance monitoring to be enabled.
   *
   * @default true
   */
  enableAppStartTracking?: boolean;

  /**
   * Track the slow and frozen frames in the application. Enabling this options will add
   * slow and frozen frames measurements to all created root spans (transactions).
   *
   * @default true
   */
  enableNativeFramesTracking?: boolean;

  /**
   * Track when and how long the JS event loop stalls for. Adds stalls as measurements to all transactions.
   *
   * @default true
   */
  enableStallTracking?: boolean;

  /**
   * Trace User Interaction events like touch and gestures.
   *
   * @default false
   */
  enableUserInteractionTracing?: boolean;

  /**
   * The sample rate for profiling
   * 1.0 will profile all transactions and 0 will profile none.
   */
  profilesSampleRate?: number;

  /**
   * The sample rate for session-long replays.
   * 1.0 will record all sessions and 0 will record none.
   */
  replaysSessionSampleRate?: number;

  /**
   * The sample rate for sessions that has had an error occur.
   * This is independent of `sessionSampleRate`.
   * 1.0 will record all sessions and 0 will record none.
   */
  replaysOnErrorSampleRate?: number;

  /**
   * Controls how many milliseconds to wait before shutting down. The default is 2 seconds. Setting this too low can cause
   * problems for sending events from command line applications. Setting it too
   * high can cause the application to block for users with network connectivity
   * problems.
   */
  shutdownTimeout?: number;

  /**
   * Defines the quality of the session replay. The higher the quality, the more accurate the replay
   * will be, but also more data to transfer and more CPU load.
   *
   * @default 'medium'
   */
  replaysSessionQuality?: SentryReplayQuality;

  /**
   * Options which are in beta, or otherwise not guaranteed to be stable.
   */
  _experiments?: SharedExperimentsSubset & {
    [key: string]: unknown;

    /**
     * @deprecated Use `replaysSessionSampleRate` in the options root instead.
     *
     * This will be removed in the next major version.
     */
    replaysSessionSampleRate?: number;

    /**
     * @deprecated Use `replaysOnErrorSampleRate` in the options root instead.
     *
     * This will be removed in the next major version.
     */
    replaysOnErrorSampleRate?: number;

    /**
     * Experiment: A more reliable way to report unhandled C++ exceptions in iOS.
     *
     * This approach hooks into all instances of the `__cxa_throw` function, which provides a more comprehensive and consistent exception handling across an app's runtime, regardless of the number of C++ modules or how they're linked. It helps in obtaining accurate stack traces.
     *
     * - Note: The mechanism of hooking into `__cxa_throw` could cause issues with symbolication on iOS due to caching of symbol references.
     *
     * @default false
     * @platform ios
     */
    enableUnhandledCPPExceptionsV2?: boolean;

    /**
     * Configuration options for UI profiling.
     * It supports two modes: `manual` and `trace`.
     * - In `trace` mode, the profiler runs based on active sampled spans.
     * - In `manual` mode, profiling is controlled via start/stop API calls.
     *
     * @experimental
     */
    profilingOptions?: ProfilingOptions;

    /**
     * Configuration options for Android UI profiling.
     * It supports two modes: `manual` and `trace`.
     * - In `trace` mode, the profiler runs based on active sampled spans.
     * - In `manual` mode, profiling is controlled via start/stop API calls.
     *
     * @experimental
     * @deprecated Use `profilingOptions` instead. This option will be removed in the next major version.
     */
    androidProfilingOptions?: ProfilingOptions;
  };

  /**
   * This options changes the placement of the attached stacktrace of `captureMessage` in the event.
   *
   * @default false
   * @deprecated This option will be removed in the next major version. Use `beforeSend` instead.
   */
  useThreadsForMessageStack?: boolean;

  /**
   * If set to `true`, the SDK propagates the W3C `traceparent` header to any outgoing requests,
   * in addition to the `sentry-trace` and `baggage` headers. Use the {@link CoreOptions.tracePropagationTargets}
   * option to control to which outgoing requests the header will be attached.
   *
   * **Important:** If you set this option to `true`, make sure that you configured your servers'
   * CORS settings to allow the `traceparent` header. Otherwise, requests might get blocked.
   *
   * @see https://www.w3.org/TR/trace-context/
   *
   * @default false
   */
  propagateTraceparent?: boolean;

  /**
   * Controls which log origin is captured when `enableLogs` is set to true.
   * 'all' will log all origins.
   * 'js' will capture only JavaScript logs.
   * 'native' will capture only native logs.
   *
   * @default 'all'
   */
  logsOrigin?: 'all' | 'js' | 'native';
}

export type SentryReplayQuality = 'low' | 'medium' | 'high';

/**
 * UI profiling lifecycle modes.
 * - `trace`: Profiler runs based on active sampled spans
 * - `manual`: Profiler is controlled manually via start/stop API calls
 */
export type ProfilingLifecycle = 'trace' | 'manual';

/**
 * Configuration options for UI profiling.
 *
 * @experimental
 */
export interface ProfilingOptions {
  /**
   * Sample rate for profiling sessions.
   * This is evaluated once per session and determines if profiling should be enabled for that session.
   * 1.0 will enable profiling for all sessions, 0.0 will disable profiling.
   *
   * @default undefined (profiling disabled)
   */
  profileSessionSampleRate?: number;

  /**
   * Profiling lifecycle mode.
   * - `trace`: Profiler runs while there is at least one active sampled span
   * - `manual`: Profiler is controlled manually via Sentry.profiler.startProfiler/stopProfiler
   *
   * @default 'manual'
   */
  lifecycle?: ProfilingLifecycle;

  /**
   * Enable profiling on app start.
   * - In `trace` mode: The app start profile stops automatically when the app start root span finishes
   * - In `manual` mode: The app start profile must be stopped through Sentry.profiler.stopProfiler()
   *
   * @default false
   */
  startOnAppStart?: boolean;
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

export interface ReactNativeOptions
  extends Omit<Options<ReactNativeTransportOptions>, '_experiments'>,
    BaseReactNativeOptions {}

export interface ReactNativeClientOptions
  extends Omit<ClientOptions<ReactNativeTransportOptions>, 'tunnel' | '_experiments'>,
    BaseReactNativeOptions {}

export interface ReactNativeWrapperOptions {
  /** Props for the root React profiler */
  profilerProps?: Omit<ProfilerProps, 'updateProps' | 'children' | 'name'>;

  /** Props for the root touch event boundary */
  touchEventBoundaryProps?: TouchEventBoundaryProps;
}

/**
 * If the user has not explicitly set `enableNativeNagger`
 * the function enables native nagging based on the current
 * environment.
 */
export function shouldEnableNativeNagger(userOptions: unknown): boolean {
  if (typeof userOptions === 'boolean') {
    // User can override the default behavior
    return userOptions;
  }

  if (Platform.OS === 'web' || Platform.OS === 'windows') {
    // We don't want to nag on known platforms that don't support native
    return false;
  }

  if (isExpoGo()) {
    // If the app is running in Expo Go, we don't want to nag
    return false;
  }

  return true;
}
