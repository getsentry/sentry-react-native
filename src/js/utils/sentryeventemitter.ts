import { logger } from '@sentry/utils';
import type { EmitterSubscription } from 'react-native';
import { NativeEventEmitter } from 'react-native';

import { getRNSentryModule } from '../wrapper';

export const NewFrameEventName = 'rn_sentry_new_frame';
export type NewFrameEventName = typeof NewFrameEventName;
export type NewFrameEvent = { newFrameTimestampInSeconds: number };

export interface SentryEventEmitter {
  /**
   * Initializes the native event emitter
   * This method is synchronous in JS but the native event emitter starts asynchronously
   * https://github.com/facebook/react-native/blob/d09c02f9e2d468e4d0bde51890e312ae7003a3e6/packages/react-native/React/Modules/RCTEventEmitter.m#L95
   */
  initAsync: (eventType: NewFrameEventName) => void;
  closeAllAsync: () => void;
  addListener: (eventType: NewFrameEventName, listener: (event: NewFrameEvent) => void) => void;
  removeListener: (eventType: NewFrameEventName, listener: (event: NewFrameEvent) => void) => void;
  once: (eventType: NewFrameEventName, listener: (event: NewFrameEvent) => void) => void;
}

/**
 * Creates emitter that allows to listen to native RNSentry events
 */
export function createSentryEventEmitter(): SentryEventEmitter {
  const openNativeListeners = new Set<EmitterSubscription>();
  const listenersMap = new Map<NewFrameEventName, Map<(event: NewFrameEvent) => void, true>>();

  const sentryNativeModule = getRNSentryModule();
  if (!sentryNativeModule) {
    return createNoopSentryEventEmitter();
  }

  const nativeEventEmitter = new NativeEventEmitter(getRNSentryModule());

  const addListener = function (eventType: NewFrameEventName, listener: (event: NewFrameEvent) => void): void {
    const map = listenersMap.get(eventType);
    if (!map) {
      logger.warn(`EventEmitter was not initialized for event type: ${eventType}`);
      return;
    }
    listenersMap.get(eventType)?.set(listener, true);
  };

  const removeListener = function (eventType: NewFrameEventName, listener: (event: NewFrameEvent) => void): void {
    listenersMap.get(eventType)?.delete(listener);
  };

  return {
    initAsync(eventType: NewFrameEventName) {
      const nativeListener = nativeEventEmitter.addListener(eventType, (event: NewFrameEvent) => {
        const listeners = listenersMap.get(eventType);
        if (!listeners) {
          return;
        }

        listeners.forEach((_, listener) => {
          listener(event);
        });
      });
      openNativeListeners.add(nativeListener);

      listenersMap.set(eventType, new Map());
    },
    closeAllAsync() {
      openNativeListeners.forEach(subscription => {
        subscription.remove();
      });
      openNativeListeners.clear();
      listenersMap.clear();
    },
    addListener,
    removeListener,
    once(eventType: NewFrameEventName, listener: (event: NewFrameEvent) => void) {
      const tmpListener = (event: NewFrameEvent): void => {
        listener(event);
        removeListener(eventType, tmpListener);
      };
      addListener(eventType, tmpListener);
    },
  };
}

function createNoopSentryEventEmitter(): SentryEventEmitter {
  return {
    initAsync: () => {
      logger.warn('Noop SentryEventEmitter: initAsync');
    },
    closeAllAsync: () => {
      logger.warn('Noop SentryEventEmitter: closeAllAsync');
    },
    addListener: () => {
      logger.warn('Noop SentryEventEmitter: addListener');
    },
    removeListener: () => {
      logger.warn('Noop SentryEventEmitter: removeListener');
    },
    once: () => {
      logger.warn('Noop SentryEventEmitter: once');
    },
  };
}
