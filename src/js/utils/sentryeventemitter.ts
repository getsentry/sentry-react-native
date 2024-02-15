import { NativeEventEmitter } from 'react-native';

import { getRNSentryModule } from '../wrapper';

export const NewFrameEventName = 'rn_sentry_new_frame'
export type NewFrameEventName = typeof NewFrameEventName;
export type NewFrameEvent = { newFrameTimestampInSeconds: number };

export interface SentryEventEmitter {
  addListener: (
    eventType: NewFrameEventName,
    listener: (event: NewFrameEvent) => void,
  ) => {
    remove: () => void;
    };
  once: (
    eventType: NewFrameEventName,
    listener: (event: NewFrameEvent) => void,
  ) => void;
}

/**
 *
 */
export function createSentryEventEmitter(): SentryEventEmitter {
  const eventEmitter = new NativeEventEmitter(getRNSentryModule());
  return {
    addListener(eventType: NewFrameEventName, listener: (event: NewFrameEvent) => void) {
      return eventEmitter.addListener(eventType, listener);
    },
    once(eventType: NewFrameEventName, listener: (event: NewFrameEvent) => void) {
      const subscription = eventEmitter.addListener(eventType, (event: NewFrameEvent) => {
        subscription.remove();
        listener(event);
      });
    }
  };
}
