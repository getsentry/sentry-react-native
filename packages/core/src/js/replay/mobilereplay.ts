import type { Client, DynamicSamplingContext, Event, Integration } from '@sentry/core';
import { logger } from '@sentry/core';

import { isHardCrash } from '../misc';
import { hasHooks } from '../utils/clientutils';
import { isExpoGo, notMobileOs } from '../utils/environment';
import { NATIVE } from '../wrapper';
import { enrichXhrBreadcrumbsForMobileReplay } from './xhrUtils';

export const MOBILE_REPLAY_INTEGRATION_NAME = 'MobileReplay';

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
   */
  enableFastViewRendering?: boolean;
}

const defaultOptions: Required<MobileReplayOptions> = {
  maskAllText: true,
  maskAllImages: true,
  maskAllVectors: true,
  enableExperimentalViewRenderer: false,
  enableViewRendererV2: true,
  enableFastViewRendering: false,
};

function mergeOptions(initOptions: Partial<MobileReplayOptions>): Required<MobileReplayOptions> {
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
  options: Required<MobileReplayOptions>;
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
    logger.warn(
      `[Sentry] ${MOBILE_REPLAY_INTEGRATION_NAME} is not supported in Expo Go. Use EAS Build or \`expo prebuild\` to enable it.`,
    );
  }
  if (notMobileOs()) {
    logger.warn(`[Sentry] ${MOBILE_REPLAY_INTEGRATION_NAME} is not supported on this platform.`);
  }

  if (isExpoGo() || notMobileOs()) {
    return mobileReplayIntegrationNoop();
  }

  const options = mergeOptions(initOptions);

  async function processEvent(event: Event): Promise<Event> {
    const hasException = event.exception && event.exception.values && event.exception.values.length > 0;
    if (!hasException) {
      // Event is not an error, will not capture replay
      return event;
    }

    const recordingReplayId = NATIVE.getCurrentReplayId();
    if (recordingReplayId) {
      logger.debug(
        `[Sentry] ${MOBILE_REPLAY_INTEGRATION_NAME} assign already recording replay ${recordingReplayId} for event ${event.event_id}.`,
      );
      return event;
    }

    const replayId = await NATIVE.captureReplay(isHardCrash(event));
    if (!replayId) {
      logger.debug(`[Sentry] ${MOBILE_REPLAY_INTEGRATION_NAME} not sampled for event ${event.event_id}.`);
      return event;
    }

    return event;
  }

  function setup(client: Client): void {
    if (!hasHooks(client)) {
      return;
    }

    client.on('createDsc', (dsc: DynamicSamplingContext) => {
      if (dsc.replay_id) {
        return;
      }

      // TODO: For better performance, we should emit replayId changes on native, and hold the replayId value in JS
      const currentReplayId = NATIVE.getCurrentReplayId();
      if (currentReplayId) {
        dsc.replay_id = currentReplayId;
      }
    });

    client.on('beforeAddBreadcrumb', enrichXhrBreadcrumbsForMobileReplay);
  }

  // TODO: When adding manual API, ensure overlap with the web replay so users can use the same API interchangeably
  // https://github.com/getsentry/sentry-javascript/blob/develop/packages/replay-internal/src/integration.ts#L45
  return {
    name: MOBILE_REPLAY_INTEGRATION_NAME,
    setupOnce() {
      /* Noop */
    },
    setup,
    processEvent,
    options: options,
  };
};

const mobileReplayIntegrationNoop = (): MobileReplayIntegration => {
  return {
    name: MOBILE_REPLAY_INTEGRATION_NAME,
    setupOnce() {
      /* Noop */
    },
    options: defaultOptions,
  };
};
