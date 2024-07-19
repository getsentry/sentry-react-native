import type { Client, DynamicSamplingContext, Event, IntegrationFnResult } from '@sentry/types';
import { logger } from '@sentry/utils';

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
   * Mask all text in recordings
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
}

const defaultOptions: Required<MobileReplayOptions> = {
  maskAllText: true,
  maskAllImages: true,
  maskAllVectors: true,
};

type MobileReplayIntegration = IntegrationFnResult & {
  options: Required<MobileReplayOptions>;
};

/**
 * The Mobile Replay Integration, let's you adjust the default mobile replay options.
 * To be passed to `Sentry.init` with `replaysOnErrorSampleRate` or `replaysSessionSampleRate`.
 *
 * ```javascript
 * Sentry.init({
 *  _experiments: {
 *    replaysOnErrorSampleRate: 1.0,
 *    replaysSessionSampleRate: 1.0,
 *  },
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

  const options = { ...defaultOptions, ...initOptions };

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
