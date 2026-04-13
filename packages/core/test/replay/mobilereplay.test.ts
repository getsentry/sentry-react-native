import type { Client, DynamicSamplingContext, ErrorEvent, Event, EventHint } from '@sentry/core';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { mobileReplayIntegration } from '../../src/js/replay/mobilereplay';
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

  describe('beforeSend wrapping', () => {
    it('should capture replay after beforeSend processes the event', async () => {
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
      expect(mockCaptureReplay).toHaveBeenCalled();
      expect(result?.contexts?.replay?.replay_id).toBe('test-replay-id');
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
      expect(mockCaptureReplay).toHaveBeenCalled();
      expect(result?.tags).toEqual({ modified: 'true' });
      expect(result?.contexts?.replay?.replay_id).toBe('test-replay-id');
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
      expect(mockCaptureReplay).toHaveBeenCalled();
      expect(result?.contexts?.replay?.replay_id).toBe('test-replay-id');
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

    it('should handle errors in processEvent and return original event', async () => {
      // Mock captureReplay to throw an error BEFORE setting up integration
      mockCaptureReplay.mockRejectedValue(new Error('Native bridge error'));

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

      // Should return the original event even when processEvent fails
      expect(result).toBeDefined();
      expect(result?.event_id).toBe('test-event-id');
      expect(mockCaptureReplay).toHaveBeenCalled();
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
      await expect(clientOptions.beforeSend?.(event, hint)).resolves.toBeDefined();

      expect(beforeErrorSampling).toHaveBeenCalled();
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
      expect(mockCaptureReplay).toHaveBeenCalled();
      expect(result?.tags).toEqual({ modified: 'true' });
      expect(result?.contexts?.replay?.replay_id).toBe('test-replay-id');
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

      await clientOptions.beforeSend?.(event, hint);

      // Verify cache was updated by checking getReplayId
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
