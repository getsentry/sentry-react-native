/* eslint-disable no-console */
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
    const originalConsole = { ...console };

    beforeEach(() => {
      console.log = jest.fn();
      console.info = jest.fn();
      console.warn = jest.fn();
      console.error = jest.fn();
    });

    afterEach(() => {
      console.log = originalConsole.log;
      console.info = originalConsole.info;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
    });

    it('logs error level to console.error', () => {
      const log: NativeLogEntry = {
        level: 'error',
        component: 'TestComponent',
        message: 'Test error message',
      };

      defaultNativeLogHandler(log);

      expect(console.error).toHaveBeenCalledWith('[Sentry] [ERROR] [TestComponent] Test error message');
    });

    it('logs fatal level to console.error', () => {
      const log: NativeLogEntry = {
        level: 'fatal',
        component: 'TestComponent',
        message: 'Test fatal message',
      };

      defaultNativeLogHandler(log);

      expect(console.error).toHaveBeenCalledWith('[Sentry] [FATAL] [TestComponent] Test fatal message');
    });

    it('logs warning level to console.warn', () => {
      const log: NativeLogEntry = {
        level: 'warning',
        component: 'TestComponent',
        message: 'Test warning message',
      };

      defaultNativeLogHandler(log);

      expect(console.warn).toHaveBeenCalledWith('[Sentry] [WARNING] [TestComponent] Test warning message');
    });

    it('logs info level to console.info', () => {
      const log: NativeLogEntry = {
        level: 'info',
        component: 'TestComponent',
        message: 'Test info message',
      };

      defaultNativeLogHandler(log);

      expect(console.info).toHaveBeenCalledWith('[Sentry] [INFO] [TestComponent] Test info message');
    });

    it('logs debug level to console.log', () => {
      const log: NativeLogEntry = {
        level: 'debug',
        component: 'TestComponent',
        message: 'Test debug message',
      };

      defaultNativeLogHandler(log);

      expect(console.log).toHaveBeenCalledWith('[Sentry] [DEBUG] [TestComponent] Test debug message');
    });

    it('logs unknown level to console.log', () => {
      const log: NativeLogEntry = {
        level: 'unknown',
        component: 'TestComponent',
        message: 'Test unknown message',
      };

      defaultNativeLogHandler(log);

      expect(console.log).toHaveBeenCalledWith('[Sentry] [UNKNOWN] [TestComponent] Test unknown message');
    });
  });
});
