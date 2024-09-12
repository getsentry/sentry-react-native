import { logger } from '@sentry/utils';
import type { EmitterSubscription } from 'react-native';
import { DeviceEventEmitter, NativeModules } from 'react-native';

import type {  Spec } from '../NativeRNSentryTimeToDisplay';
import { NATIVE } from '../wrapper';
import { isTurboModuleEnabled } from './environment';
import { ReactNativeLibraries } from './rnlibraries';
import { NewFrameEventName } from './sentryeventemitter';

function getTimeToDisplayModule(): Spec | undefined {
  return isTurboModuleEnabled()
    ? ReactNativeLibraries.TurboModuleRegistry && ReactNativeLibraries.TurboModuleRegistry.get<Spec>('RNSentryTimeToDisplay')
    : NativeModules.RNSentryTimeToDisplay;
}

const RNSentryTimeToDisplay: Spec | undefined = getTimeToDisplayModule();

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

  function defaultFallbackEventEmitter(): void {
    // Schedule the callback to be executed when all UI Frames have flushed.
    requestAnimationFrame(() => {
      if (NativeEmitterCalled) {
        NativeEmitterCalled = false;
        isListening = false;
        return;
      }
      const timestampInSeconds = timeNowNanosecond();
      waitForNativeResponseOrFallback(timestampInSeconds, 'JavaScript');
    });
  }

  function waitForNativeResponseOrFallback(fallbackSeconds: number, origin: string): void {
    const maxRetries = 3;
    let retries = 0;

    const retryCheck = (): void => {
      if (NativeEmitterCalled) {
        NativeEmitterCalled = false;
        isListening = false;
        return; // Native Replied the bridge with a timestamp.
      }

      retries++;
      if (retries < maxRetries) {
        setTimeout(retryCheck, 1_000);
      } else {
        logger.log(`[Sentry] Native event emitter did not reply in time. Using ${origin} fallback emitter.`);
        isListening = false;
        DeviceEventEmitter.emit(NewFrameEventName, {
          newFrameTimestampInSeconds: fallbackSeconds,
          isFallback: true,
        });
      }
    };

    // Start the retry process
    retryCheck();
  }

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
      if (NATIVE.isNativeAvailable() && RNSentryTimeToDisplay !== undefined) {
        RNSentryTimeToDisplay.requestAnimationFrame()
          .then((time: number) => {
            waitForNativeResponseOrFallback(time, 'Native');
          })
          .catch((reason: Error) => {
            logger.error('Failed to recceive Native fallback timestamp.', reason);
            defaultFallbackEventEmitter();
          });
      } else {
        defaultFallbackEventEmitter();
      }
    },

    closeAll() {
      subscription?.remove();
    },
  };
}
