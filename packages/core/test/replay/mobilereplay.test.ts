import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Client, DynamicSamplingContext, Event, EventHint } from '@sentry/core';
import { mobileReplayIntegration } from '../../src/js/replay/mobilereplay';
import * as environment from '../../src/js/utils/environment';
import { NATIVE } from '../../src/js/wrapper';

jest.mock('../../src/js/wrapper');

describe('Mobile Replay Integration', () => {
  let mockCaptureReplay: jest.MockedFunction<typeof NATIVE.captureReplay>;
  let mockGetCurrentReplayId: jest.MockedFunction<typeof NATIVE.getCurrentReplayId>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(environment, 'isExpoGo').mockReturnValue(false);
    jest.spyOn(environment, 'notMobileOs').mockReturnValue(false);
    mockCaptureReplay = NATIVE.captureReplay as jest.MockedFunction<typeof NATIVE.captureReplay>;
    mockGetCurrentReplayId = NATIVE.getCurrentReplayId as jest.MockedFunction<typeof NATIVE.getCurrentReplayId>;
    mockCaptureReplay.mockResolvedValue('test-replay-id');
    mockGetCurrentReplayId.mockReturnValue('test-replay-id');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('beforeErrorSampling', () => {
    it('should capture replay when beforeErrorSampling returns true', async () => {
      const beforeErrorSampling = jest.fn<(event: Event, hint: EventHint) => boolean>().mockReturnValue(true);
      const integration = mobileReplayIntegration({ beforeErrorSampling });

      const event: Event = {
        event_id: 'test-event-id',
        exception: {
          values: [{ type: 'Error', value: 'Test error' }],
        },
      };
      const hint: EventHint = {};

      if (integration.processEvent) {
        await integration.processEvent(event, hint);
      }

      expect(beforeErrorSampling).toHaveBeenCalledWith(event, hint);
      expect(mockCaptureReplay).toHaveBeenCalled();
    });

    it('should not capture replay when beforeErrorSampling returns false', async () => {
      const beforeErrorSampling = jest.fn<(event: Event, hint: EventHint) => boolean>().mockReturnValue(false);
      const integration = mobileReplayIntegration({ beforeErrorSampling });

      const event: Event = {
        event_id: 'test-event-id',
        exception: {
          values: [{ type: 'Error', value: 'Test error' }],
        },
      };
      const hint: EventHint = {};

      if (integration.processEvent) {
        await integration.processEvent(event, hint);
      }

      expect(beforeErrorSampling).toHaveBeenCalledWith(event, hint);
      expect(mockCaptureReplay).not.toHaveBeenCalled();
    });

    it('should capture replay when beforeErrorSampling returns undefined', async () => {
      const beforeErrorSampling = jest
        .fn<(event: Event, hint: EventHint) => boolean>()
        .mockReturnValue(undefined as unknown as boolean);
      const integration = mobileReplayIntegration({ beforeErrorSampling });

      const event: Event = {
        event_id: 'test-event-id',
        exception: {
          values: [{ type: 'Error', value: 'Test error' }],
        },
      };
      const hint: EventHint = {};

      if (integration.processEvent) {
        await integration.processEvent(event, hint);
      }

      expect(beforeErrorSampling).toHaveBeenCalledWith(event, hint);
      expect(mockCaptureReplay).toHaveBeenCalled();
    });

    it('should capture replay when beforeErrorSampling is not provided', async () => {
      const integration = mobileReplayIntegration();

      const event: Event = {
        event_id: 'test-event-id',
        exception: {
          values: [{ type: 'Error', value: 'Test error' }],
        },
      };
      const hint: EventHint = {};

      if (integration.processEvent) {
        await integration.processEvent(event, hint);
      }

      expect(mockCaptureReplay).toHaveBeenCalled();
    });

    it('should filter out specific error types using beforeErrorSampling', async () => {
      const beforeErrorSampling = jest.fn<(event: Event, hint: EventHint) => boolean>((event: Event) => {
        // Only capture replays for unhandled errors (not manually captured)
        const isHandled = event.exception?.values?.some(exception => exception.mechanism?.handled === true);
        return !isHandled;
      });
      const integration = mobileReplayIntegration({ beforeErrorSampling });

      // Test with handled error
      const handledEvent: Event = {
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
      };
      const hint: EventHint = {};

      if (integration.processEvent) {
        await integration.processEvent(handledEvent, hint);
      }

      expect(beforeErrorSampling).toHaveBeenCalledWith(handledEvent, hint);
      expect(mockCaptureReplay).not.toHaveBeenCalled();

      jest.clearAllMocks();

      // Test with unhandled error
      const unhandledEvent: Event = {
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
      };

      if (integration.processEvent) {
        await integration.processEvent(unhandledEvent, hint);
      }

      expect(beforeErrorSampling).toHaveBeenCalledWith(unhandledEvent, hint);
      expect(mockCaptureReplay).toHaveBeenCalled();
    });

    it('should not call beforeErrorSampling for non-error events', async () => {
      const beforeErrorSampling = jest.fn<(event: Event, hint: EventHint) => boolean>().mockReturnValue(false);
      const integration = mobileReplayIntegration({ beforeErrorSampling });

      const event: Event = {
        event_id: 'test-event-id',
        message: 'Test message without exception',
      };
      const hint: EventHint = {};

      if (integration.processEvent) {
        await integration.processEvent(event, hint);
      }

      expect(beforeErrorSampling).not.toHaveBeenCalled();
      expect(mockCaptureReplay).not.toHaveBeenCalled();
    });

    it('should handle exceptions thrown by beforeErrorSampling and proceed with capture', async () => {
      const beforeErrorSampling = jest.fn<(event: Event, hint: EventHint) => boolean>().mockImplementation(() => {
        throw new Error('Callback error');
      });
      const integration = mobileReplayIntegration({ beforeErrorSampling });

      const event: Event = {
        event_id: 'test-event-id',
        exception: {
          values: [{ type: 'Error', value: 'Test error' }],
        },
      };
      const hint: EventHint = {};

      if (integration.processEvent) {
        await integration.processEvent(event, hint);
      }

      expect(beforeErrorSampling).toHaveBeenCalledWith(event, hint);
      // Should proceed with replay capture despite callback error
      expect(mockCaptureReplay).toHaveBeenCalled();
    });

    it('should not crash the event pipeline when beforeErrorSampling throws', async () => {
      const beforeErrorSampling = jest.fn<(event: Event, hint: EventHint) => boolean>().mockImplementation(() => {
        throw new TypeError('Unexpected callback error');
      });
      const integration = mobileReplayIntegration({ beforeErrorSampling });

      const event: Event = {
        event_id: 'test-event-id',
        exception: {
          values: [{ type: 'Error', value: 'Test error' }],
        },
      };
      const hint: EventHint = {};

      // Should not throw
      if (integration.processEvent) {
        await expect(integration.processEvent(event, hint)).resolves.toBeDefined();
      }

      expect(beforeErrorSampling).toHaveBeenCalled();
      expect(mockCaptureReplay).toHaveBeenCalled();
    });
  });

  describe('processEvent', () => {
    it('should not process events without exceptions', async () => {
      const integration = mobileReplayIntegration();

      const event: Event = {
        event_id: 'test-event-id',
        message: 'Test message',
      };
      const hint: EventHint = {};

      if (integration.processEvent) {
        await integration.processEvent(event, hint);
      }

      expect(mockCaptureReplay).not.toHaveBeenCalled();
    });

    it('should process events with exceptions', async () => {
      const integration = mobileReplayIntegration();

      const event: Event = {
        event_id: 'test-event-id',
        exception: {
          values: [{ type: 'Error', value: 'Test error' }],
        },
      };
      const hint: EventHint = {};

      if (integration.processEvent) {
        await integration.processEvent(event, hint);
      }

      expect(mockCaptureReplay).toHaveBeenCalled();
    });
  });

  describe('platform checks', () => {
    it('should return noop integration in Expo Go', () => {
      jest.spyOn(environment, 'isExpoGo').mockReturnValue(true);

      const integration = mobileReplayIntegration();

      expect(integration.name).toBe('MobileReplay');
      expect(integration.processEvent).toBeUndefined();
    });

    it('should return noop integration on non-mobile platforms', () => {
      jest.spyOn(environment, 'notMobileOs').mockReturnValue(true);

      const integration = mobileReplayIntegration();

      expect(integration.name).toBe('MobileReplay');
      expect(integration.processEvent).toBeUndefined();
    });
  });

  describe('replay ID caching', () => {
    let mockClient: jest.Mocked<Client>;
    let mockOn: jest.Mock;

    beforeEach(() => {
      mockOn = jest.fn();
      mockClient = {
        on: mockOn,
      } as unknown as jest.Mocked<Client>;
      // Reset mocks for each test
      jest.clearAllMocks();
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
      if (integration.setup) {
        integration.setup(mockClient);
      }

      const event: Event = {
        event_id: 'test-event-id',
        exception: {
          values: [{ type: 'Error', value: 'Test error' }],
        },
      };
      const hint: EventHint = {};

      if (integration.processEvent) {
        await integration.processEvent(event, hint);
      }

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
      if (integration.setup) {
        integration.setup(mockClient);
      }

      const event: Event = {
        event_id: 'test-event-id',
        exception: {
          values: [{ type: 'Error', value: 'Test error' }],
        },
      };
      const hint: EventHint = {};

      if (integration.processEvent) {
        await integration.processEvent(event, hint);
      }

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
      if (integration.setup) {
        integration.setup(mockClient);
      }

      const event: Event = {
        event_id: 'test-event-id',
        exception: {
          values: [{ type: 'Error', value: 'Test error' }],
        },
      };
      const hint: EventHint = {};

      if (integration.processEvent) {
        await integration.processEvent(event, hint);
      }

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
