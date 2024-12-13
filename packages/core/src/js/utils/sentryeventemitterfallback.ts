import { logger, timestampInSeconds } from '@sentry/core';

import { NATIVE } from '../wrapper';
import type { NewFrameEvent, SentryEventEmitter } from './sentryeventemitter';
import { createSentryEventEmitter, NewFrameEventName } from './sentryeventemitter';

export const FALLBACK_TIMEOUT_MS = 10_000;

export type FallBackNewFrameEvent = { newFrameTimestampInSeconds: number; isFallback?: boolean };
export interface SentryEventEmitterFallback {
  /**
   * Initializes the fallback event emitter
   * This method is synchronous in JS but the event emitter starts asynchronously.
   */
  initAsync: () => void;
  onceNewFrame: (listener: (event: FallBackNewFrameEvent) => void) => void;
}

/**
 * Creates emitter that allows to listen to UI Frame events when ready.
 */
export function createSentryFallbackEventEmitter(
  emitter: SentryEventEmitter = createSentryEventEmitter(),
  fallbackTimeoutMs = FALLBACK_TIMEOUT_MS,
): SentryEventEmitterFallback {
  let fallbackTimeout: ReturnType<typeof setTimeout> | undefined;
  let animationFrameTimestampSeconds: number | undefined;
  let nativeNewFrameTimestampSeconds: number | undefined;

  function getAnimationFrameTimestampSeconds(): void {
    // https://reactnative.dev/docs/timers#timers
    // NOTE: The current implementation of requestAnimationFrame is the same
    // as setTimeout(0). This isn't exactly how requestAnimationFrame
    // is supposed to work on web, so it doesn't get called when UI Frames are rendered.: https://github.com/facebook/react-native/blob/5106933c750fee2ce49fe1945c3e3763eebc92bc/packages/react-native/ReactCommon/react/runtime/TimerManager.cpp#L442-L443
    requestAnimationFrame(() => {
      if (fallbackTimeout === undefined) {
        return;
      }
      animationFrameTimestampSeconds = timestampInSeconds();
    });
  }

  function getNativeNewFrameTimestampSeconds(): void {
    NATIVE.getNewScreenTimeToDisplay()
      .then(resolve => {
        if (fallbackTimeout === undefined) {
          return;
        }
        nativeNewFrameTimestampSeconds = resolve ?? undefined;
      })
      .catch(reason => {
        logger.error('Failed to receive Native fallback timestamp.', reason);
      });
  }

  return {
    initAsync() {
      emitter.initAsync(NewFrameEventName);
    },

    onceNewFrame(listener: (event: FallBackNewFrameEvent) => void) {
      animationFrameTimestampSeconds = undefined;
      nativeNewFrameTimestampSeconds = undefined;

      const internalListener = (event: NewFrameEvent): void => {
        if (fallbackTimeout !== undefined) {
          clearTimeout(fallbackTimeout);
          fallbackTimeout = undefined;
        }
        animationFrameTimestampSeconds = undefined;
        nativeNewFrameTimestampSeconds = undefined;
        listener(event);
      };
      fallbackTimeout = setTimeout(() => {
        if (nativeNewFrameTimestampSeconds) {
          logger.log('Native event emitter did not reply in time');
          return listener({
            newFrameTimestampInSeconds: nativeNewFrameTimestampSeconds,
            isFallback: true,
          });
        } else if (animationFrameTimestampSeconds) {
          logger.log('[Sentry] Native event emitter did not reply in time. Using JavaScript fallback emitter.');
          return listener({
            newFrameTimestampInSeconds: animationFrameTimestampSeconds,
            isFallback: true,
          });
        } else {
          emitter.removeListener(NewFrameEventName, internalListener);
          logger.error('Failed to receive any fallback timestamp.');
        }
      }, fallbackTimeoutMs);

      getNativeNewFrameTimestampSeconds();
      getAnimationFrameTimestampSeconds();
      emitter.once(NewFrameEventName, internalListener);
    },
  };
}
