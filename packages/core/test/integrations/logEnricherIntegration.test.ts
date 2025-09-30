import type { Client, Log } from '@sentry/core';
import { debug } from '@sentry/core';
import { logEnricherIntegration } from '../../src/js/integrations/logEnricherIntegration';
import type { NativeDeviceContextsResponse } from '../../src/js/NativeRNSentry';
import { NATIVE } from '../../src/js/wrapper';

// Mock the NATIVE wrapper
jest.mock('../../src/js/wrapper');
jest.mock('@sentry/core', () => ({
  ...jest.requireActual('@sentry/core'),
  debug: {
    log: jest.fn(),
  },
}));

const mockLogger = debug as jest.Mocked<typeof debug>;

function on_beforeCaptureLogCount(client: jest.Mocked<Client>) {
  const beforeCaptureLogCalls = client.on.mock.calls.filter(
    ([eventName, _]) => eventName.toString() === 'beforeCaptureLog',
  );

  return beforeCaptureLogCalls.length;
}

describe('LogEnricher Integration', () => {
  let mockClient: jest.Mocked<Client>;
  let mockOn: jest.Mock;
  let mockFetchNativeLogAttributes: jest.Mock;
  let mockGetIntegrationByName: jest.Mock;

  const triggerAfterInit = () => {
    const afterInitCallback = mockOn.mock.calls.find(call => call[0] === 'afterInit')?.[1] as (() => void) | undefined;
    expect(afterInitCallback).toBeDefined();
    afterInitCallback!();
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockOn = jest.fn();
    mockFetchNativeLogAttributes = jest.fn();
    mockGetIntegrationByName = jest.fn();

    mockClient = {
      on: mockOn,
      getIntegrationByName: mockGetIntegrationByName,
    } as unknown as jest.Mocked<Client>;

    (NATIVE as jest.Mocked<typeof NATIVE>).fetchNativeLogAttributes = mockFetchNativeLogAttributes;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('setup', () => {
    it('should set up the integration and register beforeCaptureLog handler after afterInit event', async () => {
      const integration = logEnricherIntegration();

      // Mock successful native response
      const mockNativeResponse: NativeDeviceContextsResponse = {
        contexts: {
          device: {
            brand: 'Apple',
            model: 'iPhone 14',
            family: 'iPhone',
          } as Record<string, unknown>,
          os: {
            name: 'iOS',
            version: '16.0',
          } as Record<string, unknown>,
          release: '1.0.0' as unknown as Record<string, unknown>,
        },
      };

      mockFetchNativeLogAttributes.mockResolvedValue(mockNativeResponse);

      integration.setup(mockClient);

      // Initially, only afterInit handler should be registered
      expect(mockOn).toHaveBeenCalledWith('afterInit', expect.any(Function));
      expect(mockOn).toHaveBeenCalledTimes(1);

      triggerAfterInit();

      await jest.runAllTimersAsync();

      expect(mockOn).toHaveBeenCalledWith('beforeCaptureLog', expect.any(Function));
      expect(mockFetchNativeLogAttributes).toHaveBeenCalledTimes(1);
    });

    it('should handle native fetch failure gracefully', async () => {
      const integration = logEnricherIntegration();

      const errorMessage = 'Native fetch failed';
      mockFetchNativeLogAttributes.mockRejectedValue(new Error(errorMessage));

      integration.setup(mockClient);

      triggerAfterInit();

      await jest.runAllTimersAsync();

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('[LOGS]: Failed to prepare attributes from Native Layer'),
      );
      expect(mockOn).toHaveBeenCalledTimes(1);
    });

    it('should handle null response from native layer', async () => {
      const integration = logEnricherIntegration();

      mockFetchNativeLogAttributes.mockResolvedValue(null);

      integration.setup(mockClient);

      triggerAfterInit();

      await jest.runAllTimersAsync();

      expect(mockOn).toHaveBeenCalledWith('beforeCaptureLog', expect.any(Function));

      expect(on_beforeCaptureLogCount(mockClient)).toBe(1);
    });
  });

  describe('log processing', () => {
    let logHandler: (log: Log) => void;
    let mockLog: Log;

    beforeEach(async () => {
      const integration = logEnricherIntegration();

      const mockNativeResponse: NativeDeviceContextsResponse = {
        contexts: {
          device: {
            brand: 'Apple',
            model: 'iPhone 14',
            family: 'iPhone',
          } as Record<string, unknown>,
          os: {
            name: 'iOS',
            version: '16.0',
          } as Record<string, unknown>,
          release: '1.0.0' as unknown as Record<string, unknown>,
        },
      };

      mockFetchNativeLogAttributes.mockResolvedValue(mockNativeResponse);

      integration.setup(mockClient);

      // Simulate the afterInit event
      triggerAfterInit();

      // Wait for the async operations to complete
      await jest.runAllTimersAsync();

      // Extract the log handler
      const beforeCaptureLogCall = mockOn.mock.calls.find(call => call[0] === 'beforeCaptureLog');
      expect(beforeCaptureLogCall).toBeDefined();
      logHandler = beforeCaptureLogCall[1];

      mockLog = {
        message: 'Test log message',
        level: 'info',
        attributes: {},
      };
    });

    it('should enrich log with device attributes', () => {
      logHandler(mockLog);

      expect(mockLog.attributes).toEqual({
        'device.brand': 'Apple',
        'device.model': 'iPhone 14',
        'device.family': 'iPhone',
        'os.name': 'iOS',
        'os.version': '16.0',
        'sentry.release': '1.0.0',
      });
    });

    it('should preserve existing log attributes', () => {
      mockLog.attributes = {
        existing: 'value',
        'custom.attr': 'custom-value',
      };

      logHandler(mockLog);

      expect(mockLog.attributes).toEqual({
        existing: 'value',
        'custom.attr': 'custom-value',
        'device.brand': 'Apple',
        'device.model': 'iPhone 14',
        'device.family': 'iPhone',
        'os.name': 'iOS',
        'os.version': '16.0',
        'sentry.release': '1.0.0',
      });
    });

    it('should handle log without attributes', () => {
      mockLog.attributes = undefined;

      logHandler(mockLog);

      expect(mockLog.attributes).toEqual({
        'device.brand': 'Apple',
        'device.model': 'iPhone 14',
        'device.family': 'iPhone',
        'os.name': 'iOS',
        'os.version': '16.0',
        'sentry.release': '1.0.0',
      });
    });

    it('should only add attributes that exist in cache', async () => {
      const integration = logEnricherIntegration();

      const partialNativeResponse: NativeDeviceContextsResponse = {
        contexts: {
          device: {
            brand: 'Apple',
            // model and family missing
          } as Record<string, unknown>,
          os: {
            name: 'iOS',
            // version missing
          } as Record<string, unknown>,
          // release missing
        },
      };

      mockFetchNativeLogAttributes.mockResolvedValue(partialNativeResponse);

      integration.setup(mockClient);

      triggerAfterInit();

      await jest.runAllTimersAsync();

      const beforeCaptureLogCall = mockOn.mock.calls.find(call => call[0] === 'beforeCaptureLog');
      expect(beforeCaptureLogCall).toBeDefined();
      const newLogHandler = beforeCaptureLogCall[1];

      newLogHandler(mockLog);

      expect(mockLog.attributes).toEqual({
        'device.brand': 'Apple',
        'os.name': 'iOS',
      });
    });

    it('should not register beforeCaptureLog handler when native fetch fails', async () => {
      const integration = logEnricherIntegration();

      mockFetchNativeLogAttributes.mockRejectedValue(new Error('Failed'));

      integration.setup(mockClient);

      triggerAfterInit();

      await jest.runAllTimersAsync();

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('[LOGS]: Failed to prepare attributes from Native Layer'),
      );

      // Default client count.
      expect(on_beforeCaptureLogCount(mockClient)).toBe(1);
    });

    it('should handle empty contexts in native response', async () => {
      const integration = logEnricherIntegration();

      const emptyNativeResponse: NativeDeviceContextsResponse = {
        contexts: {},
      };

      mockFetchNativeLogAttributes.mockResolvedValue(emptyNativeResponse);

      integration.setup(mockClient);

      triggerAfterInit();

      await jest.runAllTimersAsync();

      const beforeCaptureLogCall = mockOn.mock.calls.find(call => call[0] === 'beforeCaptureLog');
      expect(beforeCaptureLogCall).toBeDefined();
      const emptyLogHandler = beforeCaptureLogCall[1];

      emptyLogHandler(mockLog);

      expect(mockLog.attributes).toEqual({});

      expect(on_beforeCaptureLogCount(mockClient)).toBe(2);
    });

    it('should handle partial device context', async () => {
      const integration = logEnricherIntegration();

      const partialDeviceResponse: NativeDeviceContextsResponse = {
        contexts: {
          device: {
            brand: 'Samsung',
            model: 'Galaxy S21',
            // family missing
          } as Record<string, unknown>,
        },
      };

      mockFetchNativeLogAttributes.mockResolvedValue(partialDeviceResponse);

      integration.setup(mockClient);

      triggerAfterInit();

      await jest.runAllTimersAsync();

      const beforeCaptureLogCall = mockOn.mock.calls.find(call => call[0] === 'beforeCaptureLog');
      expect(beforeCaptureLogCall).toBeDefined();
      const partialLogHandler = beforeCaptureLogCall[1];

      partialLogHandler(mockLog);

      expect(mockLog.attributes).toEqual({
        'device.brand': 'Samsung',
        'device.model': 'Galaxy S21',
      });

      expect(on_beforeCaptureLogCount(mockClient)).toBe(2);
    });

    it('should handle partial OS context', async () => {
      const integration = logEnricherIntegration();

      const partialOsResponse: NativeDeviceContextsResponse = {
        contexts: {
          os: {
            name: 'Android',
            // version missing
          } as Record<string, unknown>,
        },
      };

      mockFetchNativeLogAttributes.mockResolvedValue(partialOsResponse);

      integration.setup(mockClient);

      triggerAfterInit();

      await jest.runAllTimersAsync();

      const beforeCaptureLogCall = mockOn.mock.calls.find(call => call[0] === 'beforeCaptureLog');
      expect(beforeCaptureLogCall).toBeDefined();
      const partialLogHandler = beforeCaptureLogCall[1];

      partialLogHandler(mockLog);

      expect(mockLog.attributes).toEqual({
        'os.name': 'Android',
      });

      expect(on_beforeCaptureLogCount(mockClient)).toBe(2);
    });
  });

  describe('error handling', () => {
    it('should handle errors', async () => {
      const integration = logEnricherIntegration();

      mockFetchNativeLogAttributes.mockRejectedValue(new Error('Failed to Initialize'));

      integration.setup(mockClient);

      triggerAfterInit();

      await jest.runAllTimersAsync();

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('[LOGS]: Failed to prepare attributes from Native Layer'),
      );
      expect(mockLogger.log).toHaveBeenCalledWith(expect.stringContaining('Failed to Initialize'));

      expect(on_beforeCaptureLogCount(mockClient)).toBe(0);
    });

    it('should handle malformed native response', async () => {
      const integration = logEnricherIntegration();

      const malformedResponse = {
        someUnexpectedKey: 'value',
      };

      mockFetchNativeLogAttributes.mockResolvedValue(malformedResponse as NativeDeviceContextsResponse);

      integration.setup(mockClient);

      triggerAfterInit();

      await jest.runAllTimersAsync();

      expect(mockOn).toHaveBeenCalledWith('beforeCaptureLog', expect.any(Function));
    });
  });

  describe('replay log functionality', () => {
    let logHandler: (log: Log) => void;
    let mockLog: Log;
    let mockGetIntegrationByName: jest.Mock;

    beforeEach(async () => {
      const integration = logEnricherIntegration();

      const mockNativeResponse: NativeDeviceContextsResponse = {
        contexts: {
          device: {
            brand: 'Apple',
            model: 'iPhone 14',
            family: 'iPhone',
          } as Record<string, unknown>,
          os: {
            name: 'iOS',
            version: '16.0',
          } as Record<string, unknown>,
          release: '1.0.0' as unknown as Record<string, unknown>,
        },
      };

      mockFetchNativeLogAttributes.mockResolvedValue(mockNativeResponse);
      mockGetIntegrationByName = jest.fn();

      mockClient = {
        on: mockOn,
        getIntegrationByName: mockGetIntegrationByName,
      } as unknown as jest.Mocked<Client>;

      integration.setup(mockClient);

      triggerAfterInit();

      await jest.runAllTimersAsync();

      const beforeCaptureLogCall = mockOn.mock.calls.find(call => call[0] === 'beforeCaptureLog');
      expect(beforeCaptureLogCall).toBeDefined();
      logHandler = beforeCaptureLogCall[1];

      mockLog = {
        message: 'Test log message',
        level: 'info',
        attributes: {},
      };
    });

    it('should add replay_id when MobileReplay integration is available and returns a replay ID', () => {
      const mockReplayId = 'replay-123-abc';
      const mockReplayIntegration = {
        getReplayId: jest.fn().mockReturnValue(mockReplayId),
      };

      mockGetIntegrationByName.mockReturnValue(mockReplayIntegration);

      logHandler(mockLog);

      expect(mockLog.attributes).toEqual({
        'device.brand': 'Apple',
        'device.model': 'iPhone 14',
        'device.family': 'iPhone',
        'os.name': 'iOS',
        'os.version': '16.0',
        'sentry.release': '1.0.0',
        'sentry.replay_id': mockReplayId,
      });
      expect(mockGetIntegrationByName).toHaveBeenCalledWith('MobileReplay');
      expect(mockReplayIntegration.getReplayId).toHaveBeenCalled();
    });

    it('should not add replay_id when MobileReplay integration returns null', () => {
      const mockReplayIntegration = {
        getReplayId: jest.fn().mockReturnValue(null),
      };

      mockGetIntegrationByName.mockReturnValue(mockReplayIntegration);

      logHandler(mockLog);

      expect(mockLog.attributes).toEqual({
        'device.brand': 'Apple',
        'device.model': 'iPhone 14',
        'device.family': 'iPhone',
        'os.name': 'iOS',
        'os.version': '16.0',
        'sentry.release': '1.0.0',
      });
      expect(mockGetIntegrationByName).toHaveBeenCalledWith('MobileReplay');
      expect(mockReplayIntegration.getReplayId).toHaveBeenCalled();
    });

    it('should not add replay_id when MobileReplay integration is not available', () => {
      mockGetIntegrationByName.mockReturnValue(undefined);

      logHandler(mockLog);

      expect(mockLog.attributes).toEqual({
        'device.brand': 'Apple',
        'device.model': 'iPhone 14',
        'device.family': 'iPhone',
        'os.name': 'iOS',
        'os.version': '16.0',
        'sentry.release': '1.0.0',
      });
      expect(mockGetIntegrationByName).toHaveBeenCalledWith('MobileReplay');
    });
  });
});
