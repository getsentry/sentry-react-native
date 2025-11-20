import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Event, EventHint } from '@sentry/core';
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
      const beforeErrorSampling = jest.fn().mockReturnValue(true);
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
      const beforeErrorSampling = jest.fn().mockReturnValue(false);
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
      const beforeErrorSampling = jest.fn().mockReturnValue(undefined);
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
      const beforeErrorSampling = jest.fn((event: Event) => {
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
      const beforeErrorSampling = jest.fn().mockReturnValue(false);
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
});
