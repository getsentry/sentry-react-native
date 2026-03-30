import { timestampInSeconds } from '@sentry/core';
import * as EventEmitter from 'events';

import type { NewFrameEvent } from '../../src/js/utils/sentryeventemitter';
import type { SentryEventEmitterFallback } from '../../src/js/utils/sentryeventemitterfallback';
import type { MockInterface } from '../testutils';

export const NewFrameEventName = 'rn_sentry_new_frame';
export type NewFrameEventName = typeof NewFrameEventName;
export interface MockedSentryEventEmitterFallback extends MockInterface<SentryEventEmitterFallback> {
  emitNewFrameEvent: (timestampSeconds?: number) => void;
}
export function createMockedSentryFallbackEventEmitter(): MockedSentryEventEmitterFallback {
  const emitter = new EventEmitter();
  return {
    initAsync: jest.fn(),
    emitNewFrameEvent: jest.fn((timestampSeconds?: number) => {
      emitter.emit(NewFrameEventName, <NewFrameEvent>{
        newFrameTimestampInSeconds: timestampSeconds || timestampInSeconds(),
      });
    }),
    onceNewFrame: jest.fn((listener: (event: NewFrameEvent) => void) => {
      emitter.once(NewFrameEventName, listener);
    }),
  };
}
export const createSentryFallbackEventEmitter = jest.fn(() => createMockedSentryFallbackEventEmitter());
