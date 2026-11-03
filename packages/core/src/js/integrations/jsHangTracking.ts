import type { Integration } from '@sentry/core';

import type { ReactNativeClient } from '../client';

import { getDebugMetadata } from '../profiling/debugid';
import { NATIVE } from '../wrapper';

const INTEGRATION_NAME = 'JsHangTracking';

const DEFAULT_TIMEOUT_INTERVAL_SECONDS = 2;

/**
 * Starts the native watchdog that reports the JavaScript thread when it stays blocked.
 *
 * The native SDK captures the event, because no JavaScript runs while the thread is blocked.
 */
export const jsHangTrackingIntegration = ({
  timeoutIntervalSeconds = DEFAULT_TIMEOUT_INTERVAL_SECONDS,
}: {
  timeoutIntervalSeconds?: number;
} = {}): Integration => {
  return {
    name: INTEGRATION_NAME,
    setup(client: ReactNativeClient): void {
      // The JS bundle Debug ID lets the backend symbolicate the frames of the native event.
      client.on('afterInit', () => {
        NATIVE.startJsHangTracking(timeoutIntervalSeconds * 1000, getDebugMetadata()[0]?.debug_id ?? null);
      });
      client.on('close', () => {
        NATIVE.stopJsHangTracking();
      });
    },
  };
};
