import { debug } from '@sentry/core';
import { defaultNativeLogHandler, setupNativeLogListener } from '../src/js/NativeLogListener';
import type { NativeLogEntry } from '../src/js/options';

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
