import type { Integration } from '@sentry/core';

import { debug } from '@sentry/core';

import type { ReactNativeClient } from '../client';

import { getDebugMetadata } from '../profiling/debugid';
import { NATIVE } from '../wrapper';

const INTEGRATION_NAME = 'JsHangTracking';

const DEFAULT_TIMEOUT_INTERVAL_SECONDS = 2;
// Each event also samples the JS thread for 300 ms, so very short stalls must not count as hangs.
const MIN_TIMEOUT_INTERVAL_SECONDS = 0.25;

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
  let timeoutIntervalMs = DEFAULT_TIMEOUT_INTERVAL_SECONDS * 1000;
  if (!Number.isFinite(timeoutIntervalSeconds)) {
    debug.warn(`[${INTEGRATION_NAME}] Invalid timeout interval ${timeoutIntervalSeconds}, using the default.`);
  } else if (timeoutIntervalSeconds < MIN_TIMEOUT_INTERVAL_SECONDS) {
    debug.warn(`[${INTEGRATION_NAME}] Timeout interval ${timeoutIntervalSeconds} is too short, using the minimum.`);
    timeoutIntervalMs = MIN_TIMEOUT_INTERVAL_SECONDS * 1000;
  } else {
    timeoutIntervalMs = timeoutIntervalSeconds * 1000;
  }

  return {
    name: INTEGRATION_NAME,
    setup(client: ReactNativeClient): void {
      // `afterInit` waits for the native SDK, so it can come after `close`.
      let closed = false;
      // The JS bundle Debug ID lets the backend symbolicate the frames of the native event.
      client.on('afterInit', () => {
        if (closed) {
          return;
        }
        // A JS debugger that pauses at a breakpoint blocks the JS thread too, and native code cannot
        // tell it apart from a hang.
        if (__DEV__) {
          debug.log(`[${INTEGRATION_NAME}] Not tracking JS hangs in development builds.`);
          return;
        }
        NATIVE.startJsHangTracking(timeoutIntervalMs, getDebugMetadata()[0]?.debug_id ?? null);
      });
      client.on('close', () => {
        closed = true;
        NATIVE.stopJsHangTracking();
      });
    },
  };
};
