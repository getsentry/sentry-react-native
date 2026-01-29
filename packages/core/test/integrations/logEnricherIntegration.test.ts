import type { Client, Log } from '@sentry/core';
import { debug, getCurrentScope, getGlobalScope, getIsolationScope } from '@sentry/core';
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
  getCurrentScope: jest.fn(),
  getGlobalScope: jest.fn(),
  getIsolationScope: jest.fn(),
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

    // Mock scope methods
    (getCurrentScope as jest.Mock).mockReturnValue({
      getScopeData: jest.fn().mockReturnValue({ attributes: {} }),
    });
    (getGlobalScope as jest.Mock).mockReturnValue({ getScopeData: jest.fn().mockReturnValue({ attributes: {} }) });
    (getIsolationScope as jest.Mock).mockReturnValue({ getScopeData: jest.fn().mockReturnValue({ attributes: {} }) });
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

  describe('scope attributes', () => {
    let logHandler: (log: Log) => void;
    let mockLog: Log;

    beforeEach(async () => {
      const integration = logEnricherIntegration();

      const mockNativeResponse: NativeDeviceContextsResponse = {
        contexts: {
          device: {
            brand: 'Apple',
            model: 'iPhone 14',
          } as Record<string, unknown>,
        },
      };

      mockFetchNativeLogAttributes.mockResolvedValue(mockNativeResponse);

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

    it('should apply attributes from global scope to logs', () => {
      (getGlobalScope as jest.Mock).mockReturnValue({
        getScopeData: jest.fn().mockReturnValue({
          attributes: {
            is_admin: true,
            auth_provider: 'google',
          },
        }),
      });

      logHandler(mockLog);

      expect(mockLog.attributes).toMatchObject({
        is_admin: true,
        auth_provider: 'google',
      });
    });

    it('should apply attributes from isolation scope to logs', () => {
      (getIsolationScope as jest.Mock).mockReturnValue({
        getScopeData: jest.fn().mockReturnValue({
          attributes: {
            session_id: 'abc123',
            user_tier: 'premium',
          },
        }),
      });

      logHandler(mockLog);

      expect(mockLog.attributes).toMatchObject({
        session_id: 'abc123',
        user_tier: 'premium',
      });
    });

    it('should apply attributes from current scope to logs', () => {
      (getCurrentScope as jest.Mock).mockReturnValue({
        getScopeData: jest.fn().mockReturnValue({
          attributes: {
            step: 'authentication',
            attempt: 1,
          },
        }),
      });

      logHandler(mockLog);

      expect(mockLog.attributes).toMatchObject({
        step: 'authentication',
        attempt: 1,
      });
    });

    it('should merge attributes from all scopes with correct precedence', () => {
      (getGlobalScope as jest.Mock).mockReturnValue({
        getScopeData: jest.fn().mockReturnValue({
          attributes: {
            is_admin: true,
            environment: 'production',
          },
        }),
      });

      (getIsolationScope as jest.Mock).mockReturnValue({
        getScopeData: jest.fn().mockReturnValue({
          attributes: {
            environment: 'staging',
            session_id: 'xyz789',
          },
        }),
      });

      (getCurrentScope as jest.Mock).mockReturnValue({
        getScopeData: jest.fn().mockReturnValue({
          attributes: {
            environment: 'development',
            step: 'login',
          },
        }),
      });

      logHandler(mockLog);

      expect(mockLog.attributes).toMatchObject({
        is_admin: true,
        environment: 'development', // Current scope wins
        session_id: 'xyz789',
        step: 'login',
      });
    });

    it('should only include string, number, and boolean attribute values', () => {
      (getCurrentScope as jest.Mock).mockReturnValue({
        getScopeData: jest.fn().mockReturnValue({
          attributes: {
            stringAttr: 'value',
            numberAttr: 42,
            boolAttr: false,
            objectAttr: { nested: 'object' }, // Should be filtered out
            arrayAttr: [1, 2, 3], // Should be filtered out
            nullAttr: null, // Should be filtered out
            undefinedAttr: undefined, // Should be filtered out
          },
        }),
      });

      logHandler(mockLog);

      expect(mockLog.attributes).toMatchObject({
        stringAttr: 'value',
        numberAttr: 42,
        boolAttr: false,
      });
      expect(mockLog.attributes).not.toHaveProperty('objectAttr');
      expect(mockLog.attributes).not.toHaveProperty('arrayAttr');
      expect(mockLog.attributes).not.toHaveProperty('nullAttr');
      expect(mockLog.attributes).not.toHaveProperty('undefinedAttr');
    });

    it('should not override existing log attributes with scope attributes', () => {
      (getCurrentScope as jest.Mock).mockReturnValue({
        getScopeData: jest.fn().mockReturnValue({
          attributes: {
            step: 'authentication',
            user_id: 'scope-user',
          },
        }),
      });

      mockLog.attributes = {
        user_id: 'log-user', // This should not be overridden
        custom: 'value',
      };

      logHandler(mockLog);

      expect(mockLog.attributes).toMatchObject({
        user_id: 'log-user', // Original value preserved
        custom: 'value',
        step: 'authentication',
      });
    });

    it('should handle scopes without getScopeData method', () => {
      (getCurrentScope as jest.Mock).mockReturnValue({});
      (getGlobalScope as jest.Mock).mockReturnValue({});
      (getIsolationScope as jest.Mock).mockReturnValue({});

      logHandler(mockLog);

      // Should not throw and should still add device attributes
      expect(mockLog.attributes).toMatchObject({
        'device.brand': 'Apple',
        'device.model': 'iPhone 14',
      });
    });

    it('should handle null or undefined scopes', () => {
      (getCurrentScope as jest.Mock).mockReturnValue(null);
      (getGlobalScope as jest.Mock).mockReturnValue(undefined);
      (getIsolationScope as jest.Mock).mockReturnValue(null);

      logHandler(mockLog);

      // Should not throw and should still add device attributes
      expect(mockLog.attributes).toMatchObject({
        'device.brand': 'Apple',
        'device.model': 'iPhone 14',
      });
    });

    it('should apply scope attributes before device attributes so they can be overridden', () => {
      (getCurrentScope as jest.Mock).mockReturnValue({
        getScopeData: jest.fn().mockReturnValue({
          attributes: {
            'device.brand': 'CustomBrand', // Should be overridden by native
          },
        }),
      });

      logHandler(mockLog);

      expect(mockLog.attributes).toMatchObject({
        'device.brand': 'Apple', // Native value should override
        'device.model': 'iPhone 14',
      });
    });
  });
});
