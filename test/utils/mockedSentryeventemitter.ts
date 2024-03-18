import { timestampInSeconds } from '@sentry/utils';
import EventEmitter from 'events';

import type { NewFrameEvent, SentryEventEmitter } from '../../src/js/utils/sentryeventemitter';
import type { MockInterface } from '../testutils';

export const NewFrameEventName = 'rn_sentry_new_frame';
export type NewFrameEventName = typeof NewFrameEventName;

export interface MockedSentryEventEmitter extends MockInterface<SentryEventEmitter> {
  emitNewFrameEvent: (timestampSeconds?: number) => void;
}

export function createMockedSentryEventEmitter(): MockedSentryEventEmitter {
  const emitter = new EventEmitter();

  return {
    emitNewFrameEvent: jest.fn((timestampSeconds?: number) => {
      emitter.emit('rn_sentry_new_frame', <NewFrameEvent>{
        newFrameTimestampInSeconds: timestampSeconds || timestampInSeconds(),
      });
    }),
    once: jest.fn((event: NewFrameEventName, listener: (event: NewFrameEvent) => void) => {
      emitter.once(event, listener);
    }),
    removeListener: jest.fn((event: NewFrameEventName, listener: (event: NewFrameEvent) => void) => {
      emitter.removeListener(event, listener);
    }),
    addListener: jest.fn((event: NewFrameEventName, listener: (event: NewFrameEvent) => void) => {
      emitter.addListener(event, listener);
    }),
    initAsync: jest.fn(),
    closeAllAsync: jest.fn(() => {
      emitter.removeAllListeners();
    }),
  };
}

export const createSentryEventEmitter = jest.fn(() => createMockedSentryEventEmitter());
