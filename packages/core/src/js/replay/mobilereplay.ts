import type { Client, DynamicSamplingContext, Event, EventHint, Integration } from '@sentry/core';
import { debug } from '@sentry/core';
import { isHardCrash } from '../misc';
import { hasHooks } from '../utils/clientutils';
import { isExpoGo, notMobileOs } from '../utils/environment';
import { NATIVE } from '../wrapper';
import { enrichXhrBreadcrumbsForMobileReplay } from './xhrUtils';

export const MOBILE_REPLAY_INTEGRATION_NAME = 'MobileReplay';

/**
 * Screenshot strategy type for Android Session Replay.
 *
 * - `'canvas'`: Canvas-based screenshot strategy. This strategy does **not** support any masking options, it always masks text and images. Use this if your application has strict PII requirements.
 * - `'pixelCopy'`: Pixel copy screenshot strategy (default). Supports all masking options.
 */
export type ScreenshotStrategy = 'canvas' | 'pixelCopy';

export interface MobileReplayOptions {
  /**
   * Mask all text in recordings
   *
   * @default true
   */
  maskAllText?: boolean;

  /**
   * Mask all images in recordings
   *
   * @default true
   */
  maskAllImages?: boolean;

  /**
   * Mask all vector graphics in recordings
   * Supports `react-native-svg`
   *
   * @default true
   */
  maskAllVectors?: boolean;

  /**
   * Enables the up to 5x faster experimental view renderer used by the Session Replay integration on iOS.
   *
   * Enabling this flag will reduce the amount of time it takes to render each frame of the session replay on the main thread, therefore reducing
   * interruptions and visual lag.
   *
   * - Experiment: This is an experimental feature and is therefore disabled by default.
   *
   * @deprecated Use `enableViewRendererV2` instead.
   * @platform ios
   */
  enableExperimentalViewRenderer?: boolean;

  /**
   * Enables up to 5x faster new view renderer used by the Session Replay integration on iOS.
   *
   * Enabling this flag will reduce the amount of time it takes to render each frame of the session replay on the main thread, therefore reducing
   * interruptions and visual lag. [Our benchmarks](https://github.com/getsentry/sentry-cocoa/pull/4940) have shown a significant improvement of
   * **up to 4-5x faster rendering** (reducing `~160ms` to `~36ms` per frame) on older devices.
   *
   * - Experiment: In case you are noticing issues with the new view renderer, please report the issue on [GitHub](https://github.com/getsentry/sentry-cocoa).
   *               Eventually, we will remove this feature flag and use the new view renderer by default.
   *
   * @default true
   * @platform ios
   */
  enableViewRendererV2?: boolean;

  /**
   * Enables up to 5x faster but incomplete view rendering used by the Session Replay integration on iOS.
   *
   * Enabling this flag will reduce the amount of time it takes to render each frame of the session replay on the main thread, therefore reducing
   * interruptions and visual lag.
   *
   * - Note: This flag can only be used together with `enableExperimentalViewRenderer` with up to 20% faster render times.
   * - Experiment: This is an experimental feature and is therefore disabled by default.
   *
   * @default false
   * @platform ios
   */
  enableFastViewRendering?: boolean;

  /**
   * Sets the screenshot strategy used by the Session Replay integration on Android.
   *
   * If your application has strict PII requirements we recommend using `'canvas'`.
   * This strategy does **not** support any masking options, it always masks text and images.
   *
   * - Experiment: In case you are noticing issues with the canvas screenshot strategy, please report the issue on [GitHub](https://github.com/getsentry/sentry-java).
   *
   * @default 'pixelCopy'
   * @platform android
   */
  screenshotStrategy?: ScreenshotStrategy;

  /**
   * Callback to determine if a replay should be captured for a specific error.
   * When this callback returns `false`, no replay will be captured for the error.
   * This callback is only called when an error occurs and `replaysOnErrorSampleRate` is set.
   *
   * @param event The error event
   * @param hint Additional event information
   * @returns `false` to skip capturing a replay for this error, `true` or `undefined` to proceed with sampling
   */
  beforeErrorSampling?: (event: Event, hint: EventHint) => boolean;
}

const defaultOptions: MobileReplayOptions = {
  maskAllText: true,
  maskAllImages: true,
  maskAllVectors: true,
  enableExperimentalViewRenderer: false,
  enableViewRendererV2: true,
  enableFastViewRendering: false,
  screenshotStrategy: 'pixelCopy',
};

function mergeOptions(initOptions: Partial<MobileReplayOptions>): MobileReplayOptions {
  const merged = {
    ...defaultOptions,
    ...initOptions,
  };

  if (initOptions.enableViewRendererV2 === undefined && initOptions.enableExperimentalViewRenderer !== undefined) {
    merged.enableViewRendererV2 = initOptions.enableExperimentalViewRenderer;
  }

  return merged;
}

type MobileReplayIntegration = Integration & {
  options: MobileReplayOptions;
  getReplayId: () => string | null;
};

/**
 * The Mobile Replay Integration, let's you adjust the default mobile replay options.
 * To be passed to `Sentry.init` with `replaysOnErrorSampleRate` or `replaysSessionSampleRate`.
 *
 * ```javascript
 * Sentry.init({
 *  replaysOnErrorSampleRate: 1.0,
 *  replaysSessionSampleRate: 1.0,
 *  integrations: [mobileReplayIntegration({
 *    // Adjust the default options
 *  })],
 * });
 * ```
 *
 * @experimental
 */
export const mobileReplayIntegration = (initOptions: MobileReplayOptions = defaultOptions): MobileReplayIntegration => {
  if (isExpoGo()) {
    debug.warn(
      `[Sentry] ${MOBILE_REPLAY_INTEGRATION_NAME} is not supported in Expo Go. Use EAS Build or \`expo prebuild\` to enable it.`,
    );
  }
  if (notMobileOs()) {
    debug.warn(`[Sentry] ${MOBILE_REPLAY_INTEGRATION_NAME} is not supported on this platform.`);
  }

  if (isExpoGo() || notMobileOs()) {
    return mobileReplayIntegrationNoop();
  }

  const options = mergeOptions(initOptions);

  // Cache the replay ID in JavaScript to avoid excessive bridge calls
  // This will be updated when we know the replay ID changes (e.g., after captureReplay)
  let cachedReplayId: string | null = null;

  function updateCachedReplayId(replayId: string | null): void {
    cachedReplayId = replayId;
  }

  function getCachedReplayId(): string | null {
    if (cachedReplayId !== null) {
      return cachedReplayId;
    }
    const nativeReplayId = NATIVE.getCurrentReplayId();
    if (nativeReplayId) {
      cachedReplayId = nativeReplayId;
    }
    return nativeReplayId;
  }

  async function processEvent(event: Event, hint: EventHint): Promise<Event> {
    const hasException = event.exception?.values && event.exception.values.length > 0;
    if (!hasException) {
      // Event is not an error, will not capture replay
      return event;
    }

    // Check if beforeErrorSampling callback filters out this error
    if (initOptions.beforeErrorSampling) {
      try {
        if (initOptions.beforeErrorSampling(event, hint) === false) {
          debug.log(
            `[Sentry] ${MOBILE_REPLAY_INTEGRATION_NAME} not sent; beforeErrorSampling conditions not met for event ${event.event_id}.`,
          );
          return event;
        }
      } catch (error) {
        debug.error(
          `[Sentry] ${MOBILE_REPLAY_INTEGRATION_NAME} beforeErrorSampling callback threw an error, proceeding with replay capture`,
          error,
        );
        // Continue with replay capture if callback throws
      }
    }

    const replayId = await NATIVE.captureReplay(isHardCrash(event));
    if (replayId) {
      updateCachedReplayId(replayId);
      debug.log(
        `[Sentry] ${MOBILE_REPLAY_INTEGRATION_NAME} Captured recording replay ${replayId} for event ${event.event_id}.`,
      );
    } else {
      // Check if there's an ongoing recording and update cache if found
      const recordingReplayId = NATIVE.getCurrentReplayId();
      if (recordingReplayId) {
        updateCachedReplayId(recordingReplayId);
        debug.log(
          `[Sentry] ${MOBILE_REPLAY_INTEGRATION_NAME} assign already recording replay ${recordingReplayId} for event ${event.event_id}.`,
        );
      } else {
        updateCachedReplayId(null);
        debug.log(`[Sentry] ${MOBILE_REPLAY_INTEGRATION_NAME} not sampled for event ${event.event_id}.`);
      }
    }

    return event;
  }

  function setup(client: Client): void {
    if (!hasHooks(client)) {
      return;
    }

    // Initialize the cached replay ID on setup
    cachedReplayId = NATIVE.getCurrentReplayId();

    client.on('createDsc', (dsc: DynamicSamplingContext) => {
      if (dsc.replay_id) {
        return;
      }

      // Use cached replay ID to avoid bridge calls
      const currentReplayId = getCachedReplayId();
      if (currentReplayId) {
        dsc.replay_id = currentReplayId;
      }
    });

    client.on('beforeAddBreadcrumb', enrichXhrBreadcrumbsForMobileReplay);
  }

  function getReplayId(): string | null {
    return getCachedReplayId();
  }

  // TODO: When adding manual API, ensure overlap with the web replay so users can use the same API interchangeably
  // https://github.com/getsentry/sentry-javascript/blob/develop/packages/replay-internal/src/integration.ts#L45
  return {
    name: MOBILE_REPLAY_INTEGRATION_NAME,
    setup,
    processEvent,
    options: options,
    getReplayId: getReplayId,
  };
};

const mobileReplayIntegrationNoop = (): MobileReplayIntegration => {
  return {
    name: MOBILE_REPLAY_INTEGRATION_NAME,
    options: defaultOptions,
    getReplayId: () => null, // Mock implementation for noop version
  };
};
