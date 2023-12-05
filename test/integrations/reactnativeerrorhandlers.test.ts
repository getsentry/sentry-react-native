import { BrowserClient, defaultIntegrations, defaultStackParser } from '@sentry/browser';

const mockBrowserClient: BrowserClient = new BrowserClient({
  stackParser: defaultStackParser,
  integrations: defaultIntegrations,
  transport: jest.fn(),
});

let mockHubCaptureException: jest.Mock<void, [unknown, { syntheticException: Error }]>;

jest.mock('@sentry/core', () => {
  const core = jest.requireActual('@sentry/core');

  const scope = {
    getAttachments: jest.fn(),
  };

  const client = {
    getOptions: () => ({}),
    eventFromException: (_exception: any, _hint?: EventHint): PromiseLike<Event> =>
      mockBrowserClient.eventFromException(_exception, _hint),
  };

  const hub = {
    getClient: () => client,
    getScope: () => scope,
    captureEvent: jest.fn(),
    captureException: jest.fn(),
  };

  mockHubCaptureException = hub.captureException;

  return {
    ...core,
    addGlobalEventProcessor: jest.fn(),
    getCurrentHub: () => hub,
  };
});

jest.mock('@sentry/utils', () => {
  const utils = jest.requireActual('@sentry/utils');
  return {
    ...utils,
    logger: {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  };
});

import { getCurrentHub } from '@sentry/core';
import type { Event, EventHint, ExtendedError, Integration, SeverityLevel } from '@sentry/types';

import { ReactNativeErrorHandlers } from '../../src/js/integrations/reactnativeerrorhandlers';

interface MockTrackingOptions {
  allRejections: boolean;
  onUnhandled: jest.Mock<void, [number, unknown]>;
  onHandled: jest.Mock<void, [number]>;
}

interface MockedReactNativeErrorHandlers extends Integration {
  _loadRejectionTracking: jest.Mock<
    {
      disable: jest.Mock<void, []>;
      enable: jest.Mock<void, [MockTrackingOptions]>;
    },
    []
  >;
}

describe('ReactNativeErrorHandlers', () => {
  beforeEach(() => {
    ErrorUtils.getGlobalHandler = () => jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onError', () => {
    let errorHandlerCallback: (error: Error, isFatal: boolean) => Promise<void>;

    beforeEach(() => {
      errorHandlerCallback = () => Promise.resolve();

      ErrorUtils.setGlobalHandler = jest.fn(_callback => {
        errorHandlerCallback = _callback as typeof errorHandlerCallback;
      });

      const integration = new ReactNativeErrorHandlers();

      integration.setupOnce();

      expect(ErrorUtils.setGlobalHandler).toHaveBeenCalledWith(errorHandlerCallback);
    });

    test('Sets handled:false on a fatal error', async () => {
      await errorHandlerCallback(new Error('Test Error'), true);

      const [event] = getActualCaptureEventArgs();

      expect(event.level).toBe('fatal' as SeverityLevel);
      expect(event.exception?.values?.[0].mechanism?.handled).toBe(false);
      expect(event.exception?.values?.[0].mechanism?.type).toBe('onerror');
    });

    test('Does not set handled:false on a non-fatal error', async () => {
      await errorHandlerCallback(new Error('Test Error'), false);

      const [event] = getActualCaptureEventArgs();

      expect(event.level).toBe('error' as SeverityLevel);
      expect(event.exception?.values?.[0].mechanism?.handled).toBe(true);
      expect(event.exception?.values?.[0].mechanism?.type).toBe('generic');
    });

    test('Includes original exception in hint', async () => {
      await errorHandlerCallback(new Error('Test Error'), false);

      const [, hint] = getActualCaptureEventArgs();

      expect(hint).toEqual(expect.objectContaining({ originalException: new Error('Test Error') }));
    });
  });

  describe('onUnhandledRejection', () => {
    test('unhandled rejected promise is captured with synthetical error', async () => {
      mockHubCaptureException.mockClear();
      const integration = new ReactNativeErrorHandlers();
      const mockDisable = jest.fn();
      const mockEnable = jest.fn<void, [MockTrackingOptions]>();
      (integration as unknown as MockedReactNativeErrorHandlers)._loadRejectionTracking = jest.fn(() => ({
        disable: mockDisable,
        enable: mockEnable,
      }));
      integration.setupOnce();

      const [actualTrackingOptions] = mockEnable.mock.calls[0] || [];
      actualTrackingOptions?.onUnhandled?.(1, 'Test Error');
      const actualSyntheticError = mockHubCaptureException.mock.calls[0][1].syntheticException;

      expect(mockDisable).not.toHaveBeenCalled();
      expect(mockEnable).toHaveBeenCalledWith(
        expect.objectContaining({
          allRejections: true,
          onUnhandled: expect.any(Function),
          onHandled: expect.any(Function),
        }),
      );
      expect(mockEnable).toHaveBeenCalledTimes(1);
      expect((actualSyntheticError as ExtendedError).framesToPop).toBe(3);
    });

    test('error like unhandled rejected promise is captured without synthetical error', async () => {
      mockHubCaptureException.mockClear();
      const integration = new ReactNativeErrorHandlers();
      const mockDisable = jest.fn();
      const mockEnable = jest.fn<void, [MockTrackingOptions]>();
      (integration as unknown as MockedReactNativeErrorHandlers)._loadRejectionTracking = jest.fn(() => ({
        disable: mockDisable,
        enable: mockEnable,
      }));
      integration.setupOnce();

      const [actualTrackingOptions] = mockEnable.mock.calls[0] || [];
      actualTrackingOptions?.onUnhandled?.(1, new Error('Test Error'));
      const actualSyntheticError = mockHubCaptureException.mock.calls[0][1].syntheticException;

      expect(mockDisable).not.toHaveBeenCalled();
      expect(mockEnable).toHaveBeenCalledWith(
        expect.objectContaining({
          allRejections: true,
          onUnhandled: expect.any(Function),
          onHandled: expect.any(Function),
        }),
      );
      expect(mockEnable).toHaveBeenCalledTimes(1);
      expect(actualSyntheticError).toBeUndefined();
    });
  });
});

function getActualCaptureEventArgs() {
  const hub = getCurrentHub();
  const mockCall = (hub.captureEvent as jest.MockedFunction<typeof hub.captureEvent>).mock.calls[0];

  return mockCall;
}
