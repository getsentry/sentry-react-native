import { debug } from '@sentry/core';

import type { NativeLogEntry } from '../src/js/options';

import { defaultNativeLogHandler, setupNativeLogListener } from '../src/js/NativeLogListener';

jest.mock('../src/js/utils/environment', () => ({
  isExpoGo: jest.fn().mockReturnValue(false),
}));

jest.mock('react-native', () => ({
  NativeModules: {
    RNSentry: {},
  },
  NativeEventEmitter: jest.fn().mockImplementation(() => ({
    addListener: jest.fn().mockReturnValue({
      remove: jest.fn(),
    }),
  })),
  Platform: {
    OS: 'ios',
  },
}));

jest.mock('@sentry/core', () => ({
  debug: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('NativeLogListener', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('setupNativeLogListener', () => {
    it('returns a cleanup function on success', () => {
      const callback = jest.fn();
      const cleanup = setupNativeLogListener(callback);

      expect(cleanup).toBeDefined();
      expect(typeof cleanup).toBe('function');
    });

    it('cleanup removes only its own listener, not a later one', () => {
      const mockRemove1 = jest.fn();
      const mockRemove2 = jest.fn();
      const { NativeEventEmitter } = require('react-native');

      // First call returns listener with mockRemove1
      NativeEventEmitter.mockImplementationOnce(() => ({
        addListener: jest.fn().mockReturnValue({ remove: mockRemove1 }),
      }));
      const cleanup1 = setupNativeLogListener(jest.fn());

      // Second call returns listener with mockRemove2
      NativeEventEmitter.mockImplementationOnce(() => ({
        addListener: jest.fn().mockReturnValue({ remove: mockRemove2 }),
      }));
      const cleanup2 = setupNativeLogListener(jest.fn());

      // Calling the first cleanup should remove the first listener only
      cleanup1!();
      expect(mockRemove1).toHaveBeenCalledTimes(1);
      expect(mockRemove2).not.toHaveBeenCalled();

      // Calling the second cleanup should remove the second listener
      cleanup2!();
      expect(mockRemove2).toHaveBeenCalledTimes(1);
    });

    it('cleanup is idempotent and does not remove listener twice', () => {
      const mockRemove = jest.fn();
      const { NativeEventEmitter } = require('react-native');

      NativeEventEmitter.mockImplementationOnce(() => ({
        addListener: jest.fn().mockReturnValue({ remove: mockRemove }),
      }));
      const cleanup = setupNativeLogListener(jest.fn());

      cleanup!();
      cleanup!();

      expect(mockRemove).toHaveBeenCalledTimes(1);
    });

    it('returns undefined when platform is not ios or android', () => {
      jest.resetModules();
      jest.doMock('react-native', () => ({
        NativeModules: {
          RNSentry: {},
        },
        NativeEventEmitter: jest.fn(),
        Platform: {
          OS: 'web',
        },
      }));

      // Need to re-import after mocking
      const { setupNativeLogListener: setupNativeLogListenerWeb } = jest.requireActual('../src/js/NativeLogListener');

      const callback = jest.fn();
      const cleanup = setupNativeLogListenerWeb(callback);

      expect(cleanup).toBeUndefined();
    });
  });

  describe('defaultNativeLogHandler', () => {
    it('logs error level using debug.error', () => {
      const log: NativeLogEntry = {
        level: 'error',
        component: 'TestComponent',
        message: 'Test error message',
      };

      defaultNativeLogHandler(log);

      expect(debug.error).toHaveBeenCalledWith('[Native] [TestComponent] Test error message');
    });

    it('logs fatal level using debug.error', () => {
      const log: NativeLogEntry = {
        level: 'fatal',
        component: 'TestComponent',
        message: 'Test fatal message',
      };

      defaultNativeLogHandler(log);

      expect(debug.error).toHaveBeenCalledWith('[Native] [TestComponent] Test fatal message');
    });

    it('logs warning level using debug.warn', () => {
      const log: NativeLogEntry = {
        level: 'warning',
        component: 'TestComponent',
        message: 'Test warning message',
      };

      defaultNativeLogHandler(log);

      expect(debug.warn).toHaveBeenCalledWith('[Native] [TestComponent] Test warning message');
    });

    it('logs info level using debug.log', () => {
      const log: NativeLogEntry = {
        level: 'info',
        component: 'TestComponent',
        message: 'Test info message',
      };

      defaultNativeLogHandler(log);

      expect(debug.log).toHaveBeenCalledWith('[Native] [TestComponent] Test info message');
    });

    it('logs debug level using debug.log', () => {
      const log: NativeLogEntry = {
        level: 'debug',
        component: 'TestComponent',
        message: 'Test debug message',
      };

      defaultNativeLogHandler(log);

      expect(debug.log).toHaveBeenCalledWith('[Native] [TestComponent] Test debug message');
    });

    it('logs unknown level using debug.log', () => {
      const log: NativeLogEntry = {
        level: 'unknown',
        component: 'TestComponent',
        message: 'Test unknown message',
      };

      defaultNativeLogHandler(log);

      expect(debug.log).toHaveBeenCalledWith('[Native] [TestComponent] Test unknown message');
    });
  });
});
