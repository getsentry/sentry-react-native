import type { Client } from '@sentry/core';
import { primtiviteTagIntegration } from '../../src/js/integrations/primitiveTagIntegration';
import { NATIVE } from '../../src/js/wrapper';
import { setupTestClient } from '../mocks/client';

describe('primitiveTagIntegration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupTestClient();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('integration setup', () => {
    it('sets up beforeSendEvent handler', () => {
      const integration = primtiviteTagIntegration();
      const mockClient = {
        on: jest.fn(),
      } as any;

      integration.setup!(mockClient);

      expect(mockClient.on).toHaveBeenCalledWith('beforeSendEvent', expect.any(Function));
    });
  });

  describe('beforeSendEvent processing', () => {
    let beforeSendEventHandler: (event: any) => void;

    beforeEach(() => {
      const integration = primtiviteTagIntegration();
      const mockClient = {
        on: jest.fn((eventName, handler) => {
          if (eventName === 'beforeSendEvent') {
            beforeSendEventHandler = handler;
          }
        }),
      } as any;

      integration.setup!(mockClient);
    });

    it('handles events without tags', () => {
      const event = { message: 'test' };

      expect(() => beforeSendEventHandler(event)).not.toThrow();
      expect(event).toEqual({ message: 'test' });
    });

    it('handles events with empty tags object', () => {
      const event = { tags: {} };

      expect(() => beforeSendEventHandler(event)).not.toThrow();
      expect(event.tags).toEqual({});
    });

    it('handles events with null tags', () => {
      const event = { tags: null };

      expect(() => beforeSendEventHandler(event)).not.toThrow();
      expect(event.tags).toBeNull();
    });
  });

  describe('integration with native processor', () => {
    it('sets primitiveProcessor to PrimitiveToString function', () => {
      const integration = primtiviteTagIntegration();
      NATIVE.enableNative = true;
      jest.spyOn(NATIVE, '_setPrimitiveProcessor');

      integration.afterAllSetup!({ getOptions: () => ({}) } as Client);

      expect(NATIVE._setPrimitiveProcessor).toHaveBeenCalledWith(expect.any(Function));

      // Verify the function passed is PrimitiveToString
      const passedFunction = (NATIVE._setPrimitiveProcessor as jest.Mock).mock.calls[0][0];
      expect(passedFunction(true)).toBe('True');
      expect(passedFunction(false)).toBe('False');
      expect(passedFunction(null)).toBe('');
      expect(passedFunction(42)).toBe('42');
    });

    it('does not set processor when native is disabled', () => {
      const integration = primtiviteTagIntegration();
      NATIVE.enableNative = false;
      jest.spyOn(NATIVE, '_setPrimitiveProcessor');

      integration.afterAllSetup!({ getOptions: () => ({}) } as Client);

      expect(NATIVE._setPrimitiveProcessor).not.toHaveBeenCalled();
    });
  });
});
