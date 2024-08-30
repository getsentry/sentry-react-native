import { logger } from '@sentry/utils';
import type { EmitterSubscription } from 'react-native';
import { DeviceEventEmitter } from 'react-native';

import { NewFrameEventName } from './sentryeventemitter';

export type FallBackNewFrameEvent = { newFrameTimestampInSeconds: number; isFallback?: boolean };
export interface SentryEventEmitterFallback {
  /**
   * Initializes the fallback event emitter
   * This method is synchronous in JS but the event emitter starts asynchronously.
   */
  initAsync: () => void;
  closeAll: () => void;
  startListenerAsync: () => void;
}

function timeNowNanosecond(): number {
  return Date.now() / 1000; // Convert to nanoseconds
}

/**
 * Creates emitter that allows to listen to UI Frame events when ready.
 */
export function createSentryFallbackEventEmitter(): SentryEventEmitterFallback {
  let NativeEmitterCalled: boolean = false;
  let subscription: EmitterSubscription | undefined = undefined;
  let isListening = false;
  return {
    initAsync() {
      subscription = DeviceEventEmitter.addListener(NewFrameEventName, () => {
        // Avoid noise from pages that we do not want to track.
        if (isListening) {
          NativeEmitterCalled = true;
        }
      });
    },

    startListenerAsync() {
      isListening = true;

      // Schedule the callback to be executed when all UI Frames have flushed.
      requestAnimationFrame(() => {
        if (NativeEmitterCalled) {
          NativeEmitterCalled = false;
          isListening = false;        const timestampInSeconds = timeNowNanosecond();
          logger.log(`Native timestamp did not reply in time, using fallback.${timestampInSeconds}`);

          return;
        }
        const timestampInSeconds = timeNowNanosecond();
        const maxRetries = 3;
        let retries = 0;
        logger.log(`Native timestamp did not reply in time, using fallback.${timestampInSeconds}`);

        const retryCheck = (): void => {
          if (NativeEmitterCalled) {
            NativeEmitterCalled = false;
            isListening = false;
            return; // Native Replied the bridge with a given timestamp.
          }

          retries++;
          if (retries < maxRetries) {
            setTimeout(retryCheck, 1_000);
          } else {
            logger.log('Native timestamp did not reply in time, using fallback.');
            isListening = false;
            DeviceEventEmitter.emit(NewFrameEventName, {
              newFrameTimestampInSeconds: timestampInSeconds,
              isFallback: true,
            });
          }
        };

        // Start the retry process
        retryCheck();
      });
    },

    closeAll() {
      subscription?.remove();
    },
  };
}
