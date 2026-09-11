import type {
  Breadcrumb,
  BreadcrumbHint,
  Client,
  DynamicSamplingContext,
  ErrorEvent,
  Event,
  EventHint,
} from '@sentry/core';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { debug } from '@sentry/core';

import { mobileReplayIntegration, serializeNetworkDetailUrlsForNative } from '../../src/js/replay/mobilereplay';
import { REPLAY_RESOLVED_RESPONSE_BODY_HINT_KEY } from '../../src/js/replay/xhrUtils';
import * as scopeSync from '../../src/js/scopeSync';
import * as environment from '../../src/js/utils/environment';
import { NATIVE } from '../../src/js/wrapper';

jest.mock('../../src/js/wrapper');

describe('Mobile Replay Integration', () => {
  let mockCaptureReplay: jest.MockedFunction<typeof NATIVE.captureReplay>;
  let mockGetCurrentReplayId: jest.MockedFunction<typeof NATIVE.getCurrentReplayId>;
  let mockClient: jest.Mocked<Client>;
  let mockOn: jest.Mock;
  let clientOptions: {
    beforeSend?: (event: ErrorEvent, hint: EventHint) => Promise<ErrorEvent | null> | ErrorEvent | null;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(environment, 'isExpoGo').mockReturnValue(false);
    jest.spyOn(environment, 'notMobileOs').mockReturnValue(false);
    mockCaptureReplay = NATIVE.captureReplay as jest.MockedFunction<typeof NATIVE.captureReplay>;
    mockGetCurrentReplayId = NATIVE.getCurrentReplayId as jest.MockedFunction<typeof NATIVE.getCurrentReplayId>;
    mockCaptureReplay.mockResolvedValue('test-replay-id');
    mockGetCurrentReplayId.mockReturnValue('test-replay-id');

    // Set up mock client with hooks
    mockOn = jest.fn();
    clientOptions = {};
    mockClient = {
      on: mockOn,
      getOptions: jest.fn(() => clientOptions),
    } as unknown as jest.Mocked<Client>;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Let deferred async work (the native flush in `afterSendEvent`) settle.
  const flushAsync = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

  // The native replay flush now happens in the `afterSendEvent` client hook,
  // which only fires for events that survive sampling and are actually sent.
  // Fire it explicitly to simulate an event being sent, then wait for the
  // deferred flush to settle.
  async function fireAfterSendEvent(event: Event): Promise<void> {
    const call = mockOn.mock.calls.find(c => c[0] === 'afterSendEvent');
    const handler = call?.[1] as ((event: Event, response?: unknown) => void) | undefined;
    handler?.(event);
    await flushAsync();
  }

  describe('beforeSend wrapping', () => {
    it('links the event to the buffered replay in beforeSend and flushes it on send', async () => {
      const integration = mobileReplayIntegration();
      integration.setup?.(mockClient);

      const event = {
        event_id: 'test-event-id',
        exception: {
          values: [{ type: 'Error', value: 'Test error' }],
        },
      } as ErrorEvent;
      const hint: EventHint = {};

      const result = await clientOptions.beforeSend?.(event, hint);

      // beforeSend only links the event to the buffered replay; it does not flush.
      expect(result).toBeDefined();
      expect(result?.contexts?.replay?.replay_id).toBe('test-replay-id');
      expect(mockCaptureReplay).not.toHaveBeenCalled();

      // The flush happens once the event survives sampling and is sent.
      await fireAfterSendEvent(result as Event);
      expect(mockCaptureReplay).toHaveBeenCalledTimes(1);
    });

    it('should not capture replay when beforeSend returns null', async () => {
      const userBeforeSend = jest.fn<(event: ErrorEvent, hint: EventHint) => null>().mockReturnValue(null);
      clientOptions.beforeSend = userBeforeSend;

      const integration = mobileReplayIntegration();
      integration.setup?.(mockClient);

      const event = {
        event_id: 'test-event-id',
        exception: {
          values: [{ type: 'Error', value: 'Test error' }],
        },
      } as ErrorEvent;
      const hint: EventHint = {};

      const result = await clientOptions.beforeSend?.(event, hint);

      expect(result).toBeNull();
      expect(userBeforeSend).toHaveBeenCalledWith(event, hint);
      expect(mockCaptureReplay).not.toHaveBeenCalled();
    });

    it('should capture replay with modified event from beforeSend', async () => {
      const userBeforeSend = jest
        .fn<(event: ErrorEvent, hint: EventHint) => ErrorEvent>()
        .mockImplementation(event => ({
          ...event,
          tags: { modified: 'true' },
        }));
      clientOptions.beforeSend = userBeforeSend;

      const integration = mobileReplayIntegration();
      integration.setup?.(mockClient);

      const event = {
        event_id: 'test-event-id',
        exception: {
          values: [{ type: 'Error', value: 'Test error' }],
        },
      } as ErrorEvent;
      const hint: EventHint = {};

      const result = await clientOptions.beforeSend?.(event, hint);

      expect(result).toBeDefined();
      expect(userBeforeSend).toHaveBeenCalledWith(event, hint);
      expect(result?.tags).toEqual({ modified: 'true' });
      expect(result?.contexts?.replay?.replay_id).toBe('test-replay-id');

      await fireAfterSendEvent(result as Event);
      expect(mockCaptureReplay).toHaveBeenCalled();
    });

    it('should work when no user beforeSend is provided', async () => {
      const integration = mobileReplayIntegration();
      integration.setup?.(mockClient);

      const event = {
        event_id: 'test-event-id',
        exception: {
          values: [{ type: 'Error', value: 'Test error' }],
        },
      } as ErrorEvent;
      const hint: EventHint = {};

      const result = await clientOptions.beforeSend?.(event, hint);

      expect(result).toBeDefined();
      expect(result?.contexts?.replay?.replay_id).toBe('test-replay-id');

      await fireAfterSendEvent(result as Event);
      expect(mockCaptureReplay).toHaveBeenCalled();
    });

    it('should not process non-error events', async () => {
      const integration = mobileReplayIntegration();
      integration.setup?.(mockClient);

      const event = {
        event_id: 'test-event-id',
        message: 'Test message without exception',
      } as ErrorEvent;
      const hint: EventHint = {};

      const result = await clientOptions.beforeSend?.(event, hint);

      expect(result).toBeDefined();
      expect(mockCaptureReplay).not.toHaveBeenCalled();
      expect(result?.contexts?.replay).toBeUndefined();
    });

    it('should handle errors while linking the replay and return the original event', async () => {
      // First call (during setup) succeeds; the call inside beforeSend throws.
      mockGetCurrentReplayId.mockReturnValueOnce('test-replay-id').mockImplementation(() => {
        throw new Error('Native bridge error');
      });

      const integration = mobileReplayIntegration();
      integration.setup?.(mockClient);

      const event = {
        event_id: 'test-event-id',
        exception: {
          values: [{ type: 'Error', value: 'Test error' }],
        },
      } as ErrorEvent;
      const hint: EventHint = {};

      const result = await clientOptions.beforeSend?.(event, hint);

      // Should return the original event even when linking fails
      expect(result).toBeDefined();
      expect(result?.event_id).toBe('test-event-id');
    });

    it('should not crash the event pipeline when processEvent throws', async () => {
      // Mock captureReplay to throw a synchronous error BEFORE setting up integration
      mockCaptureReplay.mockImplementation(() => {
        throw new TypeError('Synchronous native error');
      });

      const integration = mobileReplayIntegration();
      integration.setup?.(mockClient);

      const event = {
        event_id: 'test-event-id',
        exception: {
          values: [{ type: 'Error', value: 'Test error' }],
        },
      } as ErrorEvent;
      const hint: EventHint = {};

      // Should not throw and should return the event
      await expect(clientOptions.beforeSend?.(event, hint)).resolves.toBeDefined();
    });
  });

  describe('beforeErrorSampling', () => {
    it('should capture replay when beforeErrorSampling returns true', async () => {
      const beforeErrorSampling = jest.fn<(event: Event, hint: EventHint) => boolean>().mockReturnValue(true);
      const integration = mobileReplayIntegration({ beforeErrorSampling });
      integration.setup?.(mockClient);

      const event = {
        event_id: 'test-event-id',
        exception: {
          values: [{ type: 'Error', value: 'Test error' }],
        },
      } as ErrorEvent;
      const hint: EventHint = {};

      const result = await clientOptions.beforeSend?.(event, hint);

      expect(result).toBeDefined();
      expect(beforeErrorSampling).toHaveBeenCalledWith(event, hint);

      await fireAfterSendEvent(result as Event);
      expect(mockCaptureReplay).toHaveBeenCalled();
    });

    it('should not capture replay when beforeErrorSampling returns false', async () => {
      const beforeErrorSampling = jest.fn<(event: Event, hint: EventHint) => boolean>().mockReturnValue(false);
      const integration = mobileReplayIntegration({ beforeErrorSampling });
      integration.setup?.(mockClient);

      const event = {
        event_id: 'test-event-id',
        exception: {
          values: [{ type: 'Error', value: 'Test error' }],
        },
      } as ErrorEvent;
      const hint: EventHint = {};

      const result = await clientOptions.beforeSend?.(event, hint);

      expect(result).toBeDefined();
      expect(beforeErrorSampling).toHaveBeenCalledWith(event, hint);
      expect(mockCaptureReplay).not.toHaveBeenCalled();
      expect(result?.contexts?.replay).toBeUndefined();
    });

    it('should capture replay when beforeErrorSampling returns undefined', async () => {
      const beforeErrorSampling = jest
        .fn<(event: Event, hint: EventHint) => boolean>()
        .mockReturnValue(undefined as unknown as boolean);
      const integration = mobileReplayIntegration({ beforeErrorSampling });
      integration.setup?.(mockClient);

      const event = {
        event_id: 'test-event-id',
        exception: {
          values: [{ type: 'Error', value: 'Test error' }],
        },
      } as ErrorEvent;
      const hint: EventHint = {};

      const result = await clientOptions.beforeSend?.(event, hint);

      expect(result).toBeDefined();
      expect(beforeErrorSampling).toHaveBeenCalledWith(event, hint);

      await fireAfterSendEvent(result as Event);
      expect(mockCaptureReplay).toHaveBeenCalled();
    });

    it('should capture replay when beforeErrorSampling is not provided', async () => {
      const integration = mobileReplayIntegration();
      integration.setup?.(mockClient);

      const event = {
        event_id: 'test-event-id',
        exception: {
          values: [{ type: 'Error', value: 'Test error' }],
        },
      } as ErrorEvent;
      const hint: EventHint = {};

      const result = await clientOptions.beforeSend?.(event, hint);

      expect(result).toBeDefined();

      await fireAfterSendEvent(result as Event);
      expect(mockCaptureReplay).toHaveBeenCalled();
    });

    it('should filter out specific error types using beforeErrorSampling', async () => {
      const beforeErrorSampling = jest.fn<(event: Event, hint: EventHint) => boolean>((event: Event) => {
        // Only capture replays for unhandled errors (not manually captured)
        const isHandled = event.exception?.values?.some(exception => exception.mechanism?.handled === true);
        return !isHandled;
      });
      const integration = mobileReplayIntegration({ beforeErrorSampling });
      integration.setup?.(mockClient);

      // Capture the afterSendEvent handler before the mid-test mock clear wipes
      // the registration record.
      const afterSendEventCall = mockOn.mock.calls.find(c => c[0] === 'afterSendEvent');
      const afterSendEvent = afterSendEventCall![1] as (event: Event) => void;

      // Test with handled error
      const handledEvent = {
        event_id: 'handled-event-id',
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Handled error',
              mechanism: { handled: true, type: 'generic' },
            },
          ],
        },
      } as ErrorEvent;
      const hint: EventHint = {};

      const result1 = await clientOptions.beforeSend?.(handledEvent, hint);

      expect(result1).toBeDefined();
      expect(beforeErrorSampling).toHaveBeenCalledWith(handledEvent, hint);

      // The handled error was filtered out, so it is never linked or flushed.
      afterSendEvent(result1 as Event);
      await flushAsync();
      expect(mockCaptureReplay).not.toHaveBeenCalled();

      jest.clearAllMocks();

      // Test with unhandled error
      const unhandledEvent = {
        event_id: 'unhandled-event-id',
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Unhandled error',
              mechanism: { handled: false, type: 'generic' },
            },
          ],
        },
      } as ErrorEvent;

      const result2 = await clientOptions.beforeSend?.(unhandledEvent, hint);

      expect(result2).toBeDefined();
      expect(beforeErrorSampling).toHaveBeenCalledWith(unhandledEvent, hint);

      afterSendEvent(result2 as Event);
      await flushAsync();
      expect(mockCaptureReplay).toHaveBeenCalled();
    });

    it('should not call beforeErrorSampling for non-error events', async () => {
      const beforeErrorSampling = jest.fn<(event: Event, hint: EventHint) => boolean>().mockReturnValue(false);
      const integration = mobileReplayIntegration({ beforeErrorSampling });
      integration.setup?.(mockClient);

      const event = {
        event_id: 'test-event-id',
        message: 'Test message without exception',
      } as ErrorEvent;
      const hint: EventHint = {};

      const result = await clientOptions.beforeSend?.(event, hint);

      expect(result).toBeDefined();
      expect(beforeErrorSampling).not.toHaveBeenCalled();
      expect(mockCaptureReplay).not.toHaveBeenCalled();
    });

    it('should handle exceptions thrown by beforeErrorSampling and proceed with capture', async () => {
      const beforeErrorSampling = jest.fn<(event: Event, hint: EventHint) => boolean>().mockImplementation(() => {
        throw new Error('Callback error');
      });
      const integration = mobileReplayIntegration({ beforeErrorSampling });
      integration.setup?.(mockClient);

      const event = {
        event_id: 'test-event-id',
        exception: {
          values: [{ type: 'Error', value: 'Test error' }],
        },
      } as ErrorEvent;
      const hint: EventHint = {};

      const result = await clientOptions.beforeSend?.(event, hint);

      expect(result).toBeDefined();
      expect(beforeErrorSampling).toHaveBeenCalledWith(event, hint);

      // Should proceed with replay capture despite callback error
      await fireAfterSendEvent(result as Event);
      expect(mockCaptureReplay).toHaveBeenCalled();
    });

    it('should not crash the event pipeline when beforeErrorSampling throws', async () => {
      const beforeErrorSampling = jest.fn<(event: Event, hint: EventHint) => boolean>().mockImplementation(() => {
        throw new TypeError('Unexpected callback error');
      });
      const integration = mobileReplayIntegration({ beforeErrorSampling });
      integration.setup?.(mockClient);

      const event = {
        event_id: 'test-event-id',
        exception: {
          values: [{ type: 'Error', value: 'Test error' }],
        },
      } as ErrorEvent;
      const hint: EventHint = {};

      // Should not throw
      const result = await clientOptions.beforeSend?.(event, hint);
      expect(result).toBeDefined();

      expect(beforeErrorSampling).toHaveBeenCalled();

      await fireAfterSendEvent(result as Event);
      expect(mockCaptureReplay).toHaveBeenCalled();
    });

    it('should work with both user beforeSend and beforeErrorSampling', async () => {
      const beforeErrorSampling = jest.fn<(event: Event, hint: EventHint) => boolean>().mockReturnValue(true);
      const userBeforeSend = jest
        .fn<(event: ErrorEvent, hint: EventHint) => ErrorEvent>()
        .mockImplementation(event => ({
          ...event,
          tags: { modified: 'true' },
        }));
      clientOptions.beforeSend = userBeforeSend;

      const integration = mobileReplayIntegration({ beforeErrorSampling });
      integration.setup?.(mockClient);

      const event = {
        event_id: 'test-event-id',
        exception: {
          values: [{ type: 'Error', value: 'Test error' }],
        },
      } as ErrorEvent;
      const hint: EventHint = {};

      const result = await clientOptions.beforeSend?.(event, hint);

      expect(result).toBeDefined();
      expect(userBeforeSend).toHaveBeenCalledWith(event, hint);
      expect(beforeErrorSampling).toHaveBeenCalled();
      expect(result?.tags).toEqual({ modified: 'true' });
      expect(result?.contexts?.replay?.replay_id).toBe('test-replay-id');

      await fireAfterSendEvent(result as Event);
      expect(mockCaptureReplay).toHaveBeenCalled();
    });

    it('should not capture replay when user beforeSend drops event even if beforeErrorSampling returns true', async () => {
      const beforeErrorSampling = jest.fn<(event: Event, hint: EventHint) => boolean>().mockReturnValue(true);
      const userBeforeSend = jest.fn<(event: ErrorEvent, hint: EventHint) => null>().mockReturnValue(null);
      clientOptions.beforeSend = userBeforeSend;

      const integration = mobileReplayIntegration({ beforeErrorSampling });
      integration.setup?.(mockClient);

      const event = {
        event_id: 'test-event-id',
        exception: {
          values: [{ type: 'Error', value: 'Test error' }],
        },
      } as ErrorEvent;
      const hint: EventHint = {};

      const result = await clientOptions.beforeSend?.(event, hint);

      expect(result).toBeNull();
      expect(userBeforeSend).toHaveBeenCalledWith(event, hint);
      // beforeErrorSampling should never be called because beforeSend dropped the event
      expect(beforeErrorSampling).not.toHaveBeenCalled();
      expect(mockCaptureReplay).not.toHaveBeenCalled();
    });
  });

  describe('native replay flush on send', () => {
    it('does not link or flush when there is no active recording', async () => {
      mockCaptureReplay.mockResolvedValue(null);
      mockGetCurrentReplayId.mockReturnValue(null);

      const integration = mobileReplayIntegration();
      integration.setup?.(mockClient);

      const event = {
        event_id: 'test-event-id',
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Test error',
              mechanism: { handled: false, type: 'onerror' },
            },
          ],
        },
      } as ErrorEvent;
      const hint: EventHint = {};

      const result = await clientOptions.beforeSend?.(event, hint);

      // No buffered recording => nothing to link...
      expect(result).toBeDefined();
      expect(result?.contexts?.replay?.replay_id).toBeUndefined();

      // ...and nothing to flush, even after the event is sent.
      await fireAfterSendEvent(result as Event);
      expect(mockCaptureReplay).not.toHaveBeenCalled();
    });

    it('links the event to the ongoing recording and flushes it as a hard crash on send', async () => {
      mockCaptureReplay.mockResolvedValue(null);
      // First call during setup returns no ID, the call inside beforeSend returns the ongoing ID.
      mockGetCurrentReplayId.mockReturnValueOnce(null).mockReturnValue('ongoing-replay-id');

      const integration = mobileReplayIntegration();
      integration.setup?.(mockClient);

      const event = {
        event_id: 'test-event-id',
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Test error',
              mechanism: { handled: false, type: 'onerror' },
            },
          ],
        },
      } as ErrorEvent;
      const hint: EventHint = {};

      const result = await clientOptions.beforeSend?.(event, hint);

      // The event is linked to the ongoing recording in beforeSend.
      expect(result).toBeDefined();
      expect(result?.contexts?.replay?.replay_id).toBe('ongoing-replay-id');

      // The flush happens on send, propagating the hard-crash flag.
      await fireAfterSendEvent(result as Event);
      expect(mockCaptureReplay).toHaveBeenCalledWith(true); // isHardCrash
    });

    it('updates the cached replay id from the flushed replay after send', async () => {
      mockCaptureReplay.mockResolvedValue('new-replay-id');
      mockGetCurrentReplayId.mockReturnValue('buffered-replay-id');

      const integration = mobileReplayIntegration();
      integration.setup?.(mockClient);

      const event = {
        event_id: 'test-event-id',
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Test error',
              mechanism: { handled: false, type: 'onerror' },
            },
          ],
        },
      } as ErrorEvent;
      const hint: EventHint = {};

      const result = await clientOptions.beforeSend?.(event, hint);

      // The event is linked to the buffered id at beforeSend time (stable through flush).
      expect(result).toBeDefined();
      expect(result?.contexts?.replay?.replay_id).toBe('buffered-replay-id');

      // Once flushed on send, the cache reflects the id returned by the native flush.
      await fireAfterSendEvent(result as Event);
      expect(mockCaptureReplay).toHaveBeenCalled();
      expect(integration.getReplayId()).toBe('new-replay-id');
    });

    it('re-reads the current recording id when the flush uploads nothing (on-error sampling miss)', async () => {
      // A buffered replay is linked in beforeSend, but the native flush uploads
      // nothing (an on-error sampling miss resolves null). The cache must not be
      // left exposing the linked id as if it had been uploaded.
      mockGetCurrentReplayId.mockReturnValue('buffered-replay-id');
      mockCaptureReplay.mockResolvedValue(null);

      const integration = mobileReplayIntegration();
      integration.setup?.(mockClient);

      const event = {
        event_id: 'test-event-id',
        exception: {
          values: [{ type: 'Error', value: 'Test error', mechanism: { handled: false, type: 'onerror' } }],
        },
      } as ErrorEvent;

      const result = await clientOptions.beforeSend?.(event, {});
      expect(result?.contexts?.replay?.replay_id).toBe('buffered-replay-id');

      // After the miss, the still-active recording reports a fresh id.
      mockGetCurrentReplayId.mockReturnValue('still-recording-id');
      await fireAfterSendEvent(result as Event);

      // The cache was refreshed from the current recording, not left stale.
      expect(integration.getReplayId()).toBe('still-recording-id');
    });

    it('flushes a sent event regardless of how many other events were linked first', async () => {
      // Regression for the eviction race: the flush decision must live on the
      // event itself, so a linked event still flushes after many other events
      // (e.g. errors later dropped by sampling that never reach afterSendEvent)
      // were linked in beforeSend.
      mockGetCurrentReplayId.mockReturnValue('buffered-replay-id');

      const integration = mobileReplayIntegration();
      integration.setup?.(mockClient);

      const makeEvent = (id: string) =>
        ({
          event_id: id,
          exception: { values: [{ type: 'Error', value: 'Test error' }] },
        }) as ErrorEvent;

      // Link the first event but do not send it yet.
      const first = await clientOptions.beforeSend?.(makeEvent('first-event-id'), {});
      expect(first?.contexts?.replay?.replay_id).toBe('buffered-replay-id');

      // Link many more events afterwards without sending them.
      for (let i = 0; i < 200; i++) {
        await clientOptions.beforeSend?.(makeEvent(`event-${i}`), {});
      }

      // The first event is finally sent: it must still flush its replay.
      await fireAfterSendEvent(first as Event);
      expect(mockCaptureReplay).toHaveBeenCalledTimes(1);
    });
  });

  describe('runtime controls', () => {
    beforeEach(() => {
      (NATIVE.startReplay as jest.Mock).mockResolvedValue(undefined as never);
      (NATIVE.startReplayBuffering as jest.Mock).mockResolvedValue(undefined as never);
      (NATIVE.stopReplay as jest.Mock).mockResolvedValue(undefined as never);
      (NATIVE.pauseReplay as jest.Mock).mockResolvedValue(undefined as never);
      (NATIVE.resumeReplay as jest.Mock).mockResolvedValue(undefined as never);
      (NATIVE.flushReplay as jest.Mock).mockResolvedValue(undefined as never);
    });

    it('start() calls the native startReplay control', () => {
      const integration = mobileReplayIntegration();
      integration.start();
      expect(NATIVE.startReplay).toHaveBeenCalledTimes(1);
    });

    it('startBuffering() calls the native startReplayBuffering control', () => {
      const integration = mobileReplayIntegration();
      integration.startBuffering();
      expect(NATIVE.startReplayBuffering).toHaveBeenCalledTimes(1);
    });

    it('stop() calls the native stopReplay control and resolves', async () => {
      const integration = mobileReplayIntegration();
      await integration.stop();
      expect(NATIVE.stopReplay).toHaveBeenCalledTimes(1);
    });

    it('pause() calls the native pauseReplay control', () => {
      const integration = mobileReplayIntegration();
      integration.pause();
      expect(NATIVE.pauseReplay).toHaveBeenCalledTimes(1);
    });

    it('resume() calls the native resumeReplay control', () => {
      const integration = mobileReplayIntegration();
      integration.resume();
      expect(NATIVE.resumeReplay).toHaveBeenCalledTimes(1);
    });

    it('flush() calls the native flushReplay control and resolves', async () => {
      const integration = mobileReplayIntegration();
      await integration.flush();
      expect(NATIVE.flushReplay).toHaveBeenCalledTimes(1);
    });

    it('flush() keeps recording by default (does not call stopReplay)', async () => {
      const integration = mobileReplayIntegration();
      await integration.flush();
      expect(NATIVE.flushReplay).toHaveBeenCalledTimes(1);
      expect(NATIVE.stopReplay).not.toHaveBeenCalled();
    });

    it('flush({ continueRecording: true }) keeps recording (does not call stopReplay)', async () => {
      const integration = mobileReplayIntegration();
      await integration.flush({ continueRecording: true });
      expect(NATIVE.flushReplay).toHaveBeenCalledTimes(1);
      expect(NATIVE.stopReplay).not.toHaveBeenCalled();
    });

    it('flush({ continueRecording: false }) flushes then stops recording', async () => {
      const integration = mobileReplayIntegration();
      await integration.flush({ continueRecording: false });
      expect(NATIVE.flushReplay).toHaveBeenCalledTimes(1);
      expect(NATIVE.stopReplay).toHaveBeenCalledTimes(1);
    });

    it('swallows and logs a rejected fire-and-forget control', async () => {
      const error = new Error('native boom');
      (NATIVE.startReplay as jest.Mock).mockRejectedValue(error as never);
      const debugError = jest.spyOn(debug, 'error').mockImplementation(() => {});

      const integration = mobileReplayIntegration();
      // Must not throw synchronously despite the underlying rejection.
      expect(() => integration.start()).not.toThrow();

      await new Promise(resolve => setImmediate(resolve));
      expect(debugError).toHaveBeenCalledWith(expect.stringContaining('Failed to start replay'), error);
    });

    it('stop() invalidates the cached replay id so getReplayId re-reads native', async () => {
      const integration = mobileReplayIntegration();
      // Prime the cache with an active replay id.
      mockGetCurrentReplayId.mockReturnValue('old-replay-id');
      expect(integration.getReplayId()).toBe('old-replay-id');

      // After stop the native replay is gone; the stale id must not be returned.
      mockGetCurrentReplayId.mockReturnValue(null);
      await integration.stop();

      expect(integration.getReplayId()).toBeNull();
    });

    it('start() invalidates the cached replay id so getReplayId reflects the new session', async () => {
      const integration = mobileReplayIntegration();
      // Prime the cache with a previous session id.
      mockGetCurrentReplayId.mockReturnValue('old-replay-id');
      expect(integration.getReplayId()).toBe('old-replay-id');

      // A new session is created; getReplayId must pick up the fresh id.
      mockGetCurrentReplayId.mockReturnValue('new-replay-id');
      integration.start();
      await new Promise(resolve => setImmediate(resolve));

      expect(integration.getReplayId()).toBe('new-replay-id');
    });

    it('flush() invalidates the cached replay id so getReplayId re-reads native', async () => {
      const integration = mobileReplayIntegration();
      mockGetCurrentReplayId.mockReturnValue('old-replay-id');
      expect(integration.getReplayId()).toBe('old-replay-id');

      mockGetCurrentReplayId.mockReturnValue('flushed-replay-id');
      await integration.flush();

      expect(integration.getReplayId()).toBe('flushed-replay-id');
    });
  });

  describe('network detail feature markers', () => {
    let mockAddIntegration: jest.Mock;
    let mockGetIntegrationByName: jest.Mock;
    let markerClient: jest.Mocked<Client>;

    beforeEach(() => {
      mockAddIntegration = jest.fn();
      mockGetIntegrationByName = jest.fn().mockReturnValue(undefined);
      markerClient = {
        on: jest.fn(),
        getOptions: jest.fn(() => ({})),
        getIntegrationByName: mockGetIntegrationByName,
        addIntegration: mockAddIntegration,
      } as unknown as jest.Mocked<Client>;
    });

    it('does not register network markers when networkDetailAllowUrls is empty', () => {
      const integration = mobileReplayIntegration({ networkDetailAllowUrls: [] });
      integration.setup?.(markerClient);

      expect(mockAddIntegration).not.toHaveBeenCalledWith({ name: 'MobileReplayNetworkDetails' });
      expect(mockAddIntegration).not.toHaveBeenCalledWith({ name: 'MobileReplayNetworkBodies' });
    });

    it('registers both markers when networkDetailAllowUrls is set (bodies default true)', () => {
      const integration = mobileReplayIntegration({ networkDetailAllowUrls: ['https://api.example.com'] });
      integration.setup?.(markerClient);

      expect(mockAddIntegration).toHaveBeenCalledWith({ name: 'MobileReplayNetworkDetails' });
      expect(mockAddIntegration).toHaveBeenCalledWith({ name: 'MobileReplayNetworkBodies' });
    });

    it('registers only the details marker when bodies are explicitly disabled', () => {
      const integration = mobileReplayIntegration({
        networkDetailAllowUrls: ['https://api.example.com'],
        networkCaptureBodies: false,
      });
      integration.setup?.(markerClient);

      expect(mockAddIntegration).toHaveBeenCalledWith({ name: 'MobileReplayNetworkDetails' });
      expect(mockAddIntegration).not.toHaveBeenCalledWith({ name: 'MobileReplayNetworkBodies' });
    });
  });

  describe('beforeBreadcrumb wrapping (async binary response bodies)', () => {
    let mockDeferBreadcrumbNativeSync: jest.SpiedFunction<typeof scopeSync.deferBreadcrumbNativeSync>;
    let mockSyncBreadcrumbToNative: jest.SpiedFunction<typeof scopeSync.syncBreadcrumbToNative>;
    let wrapClientOptions: {
      beforeBreadcrumb?: (breadcrumb: Breadcrumb, hint?: BreadcrumbHint) => Breadcrumb | null;
    };
    let wrapClient: jest.Mocked<Client>;

    const flushMicrotasks = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

    const setupIntegration = (options?: Parameters<typeof mobileReplayIntegration>[0]): void => {
      const integration = mobileReplayIntegration({
        networkDetailAllowUrls: ['api.example.com'],
        ...options,
      });
      integration.setup?.(wrapClient);
    };

    const getBinaryXhrBreadcrumbAndHint = (body = '{"ok":true}'): { breadcrumb: Breadcrumb; hint: BreadcrumbHint } => ({
      breadcrumb: { category: 'xhr', timestamp: 123, data: { url: 'https://api.example.com/users' } },
      hint: {
        startTimestamp: 1,
        endTimestamp: 2,
        xhr: {
          __sentry_xhr_v3__: {
            method: 'GET',
            url: 'https://api.example.com/users',
            request_headers: {},
          },
          getResponseHeader: (key: string) => (key === 'content-type' ? 'application/json' : null),
          getAllResponseHeaders: () => 'content-type: application/json',
          response: new TextEncoder().encode(body).buffer,
          responseType: 'arraybuffer',
        },
      },
    });

    beforeEach(() => {
      mockDeferBreadcrumbNativeSync = jest.spyOn(scopeSync, 'deferBreadcrumbNativeSync').mockImplementation(() => {});
      mockSyncBreadcrumbToNative = jest.spyOn(scopeSync, 'syncBreadcrumbToNative').mockImplementation(() => {});
      wrapClientOptions = {};
      wrapClient = {
        on: jest.fn(),
        getOptions: jest.fn(() => wrapClientOptions),
        getIntegrationByName: jest.fn().mockReturnValue(undefined),
        addIntegration: jest.fn(),
      } as unknown as jest.Mocked<Client>;
    });

    it('keeps the breadcrumb on the scope and defers only the native sync', async () => {
      setupIntegration();
      const { breadcrumb, hint } = getBinaryXhrBreadcrumbAndHint();

      // Arrange/Act: the breadcrumb must not be dropped — error events captured
      // while the body read is in flight need to keep it.
      const result = wrapClientOptions.beforeBreadcrumb?.(breadcrumb, hint);

      expect(result).toBe(breadcrumb);
      expect(mockDeferBreadcrumbNativeSync).toHaveBeenCalledWith(breadcrumb);
      expect(mockSyncBreadcrumbToNative).not.toHaveBeenCalled();

      await flushMicrotasks();

      expect(mockSyncBreadcrumbToNative).toHaveBeenCalledTimes(1);
    });

    it('syncs a copy carrying the resolved body, leaving the scope breadcrumb untouched', async () => {
      setupIntegration();
      const { breadcrumb, hint } = getBinaryXhrBreadcrumbAndHint();

      wrapClientOptions.beforeBreadcrumb?.(breadcrumb, hint);
      await flushMicrotasks();

      const synced = mockSyncBreadcrumbToNative.mock.calls[0]?.[0] as Breadcrumb;
      expect(synced).not.toBe(breadcrumb);
      expect(synced.timestamp).toBe(123);
      expect((synced.data?.response as { body?: string }).body).toBe('{"ok":true}');
      expect(synced.data?.response_body_size).toBe(11);
      // The scope copy keeps whatever the synchronous enrichment produced.
      expect(breadcrumb.data?.response).toBeUndefined();
    });

    it('passes through breadcrumbs that do not need an async body read', async () => {
      setupIntegration();
      const breadcrumb: Breadcrumb = { category: 'console', message: 'hello' };

      expect(wrapClientOptions.beforeBreadcrumb?.(breadcrumb, {})).toBe(breadcrumb);

      await flushMicrotasks();
      expect(mockDeferBreadcrumbNativeSync).not.toHaveBeenCalled();
      expect(mockSyncBreadcrumbToNative).not.toHaveBeenCalled();
    });

    it('does not defer again for a hint that already carries a resolved body', async () => {
      setupIntegration();
      const { breadcrumb, hint } = getBinaryXhrBreadcrumbAndHint();
      const resolvedHint = { ...hint, [REPLAY_RESOLVED_RESPONSE_BODY_HINT_KEY]: { body: { body: '{"ok":true}' } } };

      expect(wrapClientOptions.beforeBreadcrumb?.(breadcrumb, resolvedHint)).toBe(breadcrumb);

      await flushMicrotasks();
      expect(mockDeferBreadcrumbNativeSync).not.toHaveBeenCalled();
      expect(mockSyncBreadcrumbToNative).not.toHaveBeenCalled();
    });

    it('runs the user beforeBreadcrumb exactly once', async () => {
      const userBeforeBreadcrumb = jest.fn((breadcrumb: Breadcrumb) => breadcrumb);
      wrapClientOptions.beforeBreadcrumb = userBeforeBreadcrumb as (
        breadcrumb: Breadcrumb,
        hint?: BreadcrumbHint,
      ) => Breadcrumb | null;
      setupIntegration();
      const { breadcrumb, hint } = getBinaryXhrBreadcrumbAndHint();

      wrapClientOptions.beforeBreadcrumb?.(breadcrumb, hint);
      await flushMicrotasks();

      expect(userBeforeBreadcrumb).toHaveBeenCalledTimes(1);
    });

    it('respects a user beforeBreadcrumb that drops the breadcrumb', async () => {
      wrapClientOptions.beforeBreadcrumb = () => null;
      setupIntegration();
      const { breadcrumb, hint } = getBinaryXhrBreadcrumbAndHint();

      expect(wrapClientOptions.beforeBreadcrumb?.(breadcrumb, hint)).toBeNull();

      await flushMicrotasks();
      expect(mockDeferBreadcrumbNativeSync).not.toHaveBeenCalled();
      expect(mockSyncBreadcrumbToNative).not.toHaveBeenCalled();
    });

    it('does not wrap beforeBreadcrumb when body capture is disabled', () => {
      setupIntegration({ networkCaptureBodies: false });
      expect(wrapClientOptions.beforeBreadcrumb).toBeUndefined();
    });

    it('does not wrap beforeBreadcrumb when no URLs are allow-listed', () => {
      const integration = mobileReplayIntegration({ networkDetailAllowUrls: [] });
      integration.setup?.(wrapClient);
      expect(wrapClientOptions.beforeBreadcrumb).toBeUndefined();
    });
  });

  describe('platform checks', () => {
    it('should return noop integration in Expo Go', () => {
      jest.spyOn(environment, 'isExpoGo').mockReturnValue(true);

      const integration = mobileReplayIntegration();

      expect(integration.name).toBe('MobileReplay');
      expect(integration.setup).toBeUndefined();
      expect(integration.getReplayId()).toBeNull();
    });

    it('should return noop integration on non-mobile platforms', () => {
      jest.spyOn(environment, 'notMobileOs').mockReturnValue(true);

      const integration = mobileReplayIntegration();

      expect(integration.name).toBe('MobileReplay');
      expect(integration.setup).toBeUndefined();
      expect(integration.getReplayId()).toBeNull();
    });
  });

  describe('replay ID caching', () => {
    beforeEach(() => {
      // Reset mocks for each test
      jest.clearAllMocks();
      // Reset client options
      clientOptions = {};
      mockOn = jest.fn();
      mockClient = {
        on: mockOn,
        getOptions: jest.fn(() => clientOptions),
      } as unknown as jest.Mocked<Client>;
    });

    it('should initialize cache with native replay ID on setup', () => {
      const initialReplayId = 'initial-replay-id';
      mockGetCurrentReplayId.mockReturnValue(initialReplayId);

      const integration = mobileReplayIntegration();
      if (integration.setup) {
        integration.setup(mockClient);
      }

      expect(mockGetCurrentReplayId).toHaveBeenCalledTimes(1);
      expect(mockOn).toHaveBeenCalledWith('createDsc', expect.any(Function));
    });

    it('should use cached replay ID in createDsc handler to avoid bridge calls', () => {
      const cachedReplayId = 'cached-replay-id';
      mockGetCurrentReplayId.mockReturnValue(cachedReplayId);

      const integration = mobileReplayIntegration();
      if (integration.setup) {
        integration.setup(mockClient);
      }

      // Extract the createDsc handler BEFORE clearing mocks
      const createDscCall = mockOn.mock.calls.find(call => call[0] === 'createDsc');
      expect(createDscCall).toBeDefined();
      const createDscHandler = createDscCall![1] as (dsc: DynamicSamplingContext) => void;

      // Clear the mock to track subsequent calls
      jest.clearAllMocks();

      // Call the handler multiple times
      const dsc1: Partial<DynamicSamplingContext> = {};
      const dsc2: Partial<DynamicSamplingContext> = {};
      const dsc3: Partial<DynamicSamplingContext> = {};

      createDscHandler(dsc1 as DynamicSamplingContext);
      createDscHandler(dsc2 as DynamicSamplingContext);
      createDscHandler(dsc3 as DynamicSamplingContext);

      // Should not call native bridge after initial setup
      expect(mockGetCurrentReplayId).not.toHaveBeenCalled();
      expect(dsc1.replay_id).toBe(cachedReplayId);
      expect(dsc2.replay_id).toBe(cachedReplayId);
      expect(dsc3.replay_id).toBe(cachedReplayId);
    });

    it('should not override existing replay_id in createDsc handler', () => {
      const cachedReplayId = 'cached-replay-id';
      mockGetCurrentReplayId.mockReturnValue(cachedReplayId);

      const integration = mobileReplayIntegration();
      if (integration.setup) {
        integration.setup(mockClient);
      }

      const createDscCall = mockOn.mock.calls.find(call => call[0] === 'createDsc');
      const createDscHandler = createDscCall![1] as (dsc: DynamicSamplingContext) => void;

      const dsc: Partial<DynamicSamplingContext> = {
        replay_id: 'existing-replay-id',
      };

      createDscHandler(dsc as DynamicSamplingContext);

      expect(dsc.replay_id).toBe('existing-replay-id');
    });

    it('should update cache when captureReplay returns a new replay ID', async () => {
      const initialReplayId = 'initial-replay-id';
      const newReplayId = 'new-replay-id';
      mockGetCurrentReplayId.mockReturnValue(initialReplayId);
      mockCaptureReplay.mockResolvedValue(newReplayId);

      const integration = mobileReplayIntegration();
      integration.setup?.(mockClient);

      const event = {
        event_id: 'test-event-id',
        exception: {
          values: [{ type: 'Error', value: 'Test error' }],
        },
      } as ErrorEvent;
      const hint: EventHint = {};

      const result = await clientOptions.beforeSend?.(event, hint);

      // Before the flush, the cache holds the buffered id linked in beforeSend.
      expect(integration.getReplayId()).toBe(initialReplayId);

      // The flush on send returns the final id and updates the cache.
      await fireAfterSendEvent(result as Event);
      expect(integration.getReplayId()).toBe(newReplayId);

      // Extract the createDsc handler BEFORE clearing mocks
      const createDscCall = mockOn.mock.calls.find(call => call[0] === 'createDsc');
      expect(createDscCall).toBeDefined();
      const createDscHandler = createDscCall![1] as (dsc: DynamicSamplingContext) => void;

      // Clear the mock to track subsequent calls
      jest.clearAllMocks();

      const dsc: Partial<DynamicSamplingContext> = {};
      createDscHandler(dsc as DynamicSamplingContext);

      expect(dsc.replay_id).toBe(newReplayId);
      expect(mockGetCurrentReplayId).not.toHaveBeenCalled();
    });

    it('should update cache when ongoing recording is detected', async () => {
      const initialReplayId = 'initial-replay-id';
      const ongoingReplayId = 'ongoing-replay-id';
      mockGetCurrentReplayId.mockReturnValue(initialReplayId);
      mockCaptureReplay.mockResolvedValue(null);
      // After captureReplay returns null, getCurrentReplayId should return ongoing recording
      mockGetCurrentReplayId.mockReturnValueOnce(initialReplayId).mockReturnValue(ongoingReplayId);

      const integration = mobileReplayIntegration();
      integration.setup?.(mockClient);

      const event = {
        event_id: 'test-event-id',
        exception: {
          values: [{ type: 'Error', value: 'Test error' }],
        },
      } as ErrorEvent;
      const hint: EventHint = {};

      await clientOptions.beforeSend?.(event, hint);

      // Verify cache was updated with ongoing recording ID
      expect(integration.getReplayId()).toBe(ongoingReplayId);
    });

    it('should clear cache when no recording is in progress', async () => {
      const initialReplayId = 'initial-replay-id';
      mockGetCurrentReplayId.mockReturnValue(initialReplayId);
      mockCaptureReplay.mockResolvedValue(null);
      // After captureReplay returns null, getCurrentReplayId should return null (no recording)
      mockGetCurrentReplayId.mockReturnValueOnce(initialReplayId).mockReturnValue(null);

      const integration = mobileReplayIntegration();
      integration.setup?.(mockClient);

      const event = {
        event_id: 'test-event-id',
        exception: {
          values: [{ type: 'Error', value: 'Test error' }],
        },
      } as ErrorEvent;
      const hint: EventHint = {};

      await clientOptions.beforeSend?.(event, hint);

      // Verify cache was cleared
      expect(integration.getReplayId()).toBeNull();
    });

    it('should use cached value in getReplayId to avoid bridge calls', () => {
      const cachedReplayId = 'cached-replay-id';
      mockGetCurrentReplayId.mockReturnValue(cachedReplayId);

      const integration = mobileReplayIntegration();
      if (integration.setup) {
        integration.setup(mockClient);
      }

      // Clear the mock to track subsequent calls
      jest.clearAllMocks();

      // Call getReplayId multiple times
      const id1 = integration.getReplayId();
      const id2 = integration.getReplayId();
      const id3 = integration.getReplayId();

      // Should not call native bridge after initial setup
      expect(mockGetCurrentReplayId).not.toHaveBeenCalled();
      expect(id1).toBe(cachedReplayId);
      expect(id2).toBe(cachedReplayId);
      expect(id3).toBe(cachedReplayId);
    });
  });
});

describe('serializeNetworkDetailUrlsForNative', () => {
  it('returns an empty array when urls are undefined', () => {
    expect(serializeNetworkDetailUrlsForNative(undefined)).toEqual([]);
  });

  it('passes through string patterns unchanged', () => {
    expect(serializeNetworkDetailUrlsForNative(['https://api.example.com', 'cdn.example.com'])).toEqual([
      'https://api.example.com',
      'cdn.example.com',
    ]);
  });

  it('converts RegExp patterns to their source string', () => {
    expect(serializeNetworkDetailUrlsForNative([/^https:\/\/api\./, /\/auth\//])).toEqual([
      '^https:\\/\\/api\\.',
      '\\/auth\\/',
    ]);
  });

  it('handles mixed string and RegExp entries', () => {
    expect(serializeNetworkDetailUrlsForNative(['api.example.com', /^https:\/\/cdn\./])).toEqual([
      'api.example.com',
      '^https:\\/\\/cdn\\.',
    ]);
  });

  it('drops empty string entries', () => {
    expect(serializeNetworkDetailUrlsForNative(['', 'api.example.com'])).toEqual(['api.example.com']);
  });
});
