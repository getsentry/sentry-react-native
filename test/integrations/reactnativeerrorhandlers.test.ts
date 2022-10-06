import { BrowserClient, defaultIntegrations, defaultStackParser } from '@sentry/browser';

const mockBrowserClient: BrowserClient = new BrowserClient({
  stackParser: defaultStackParser,
  integrations: defaultIntegrations,
  transport: jest.fn(),
});


jest.mock('@sentry/core', () => {
  const core = jest.requireActual('@sentry/core');

  const scope = {
    getAttachments: jest.fn(),
  };

  const client = {
    getOptions: () => ({}),
    eventFromException: (_exception: any, _hint?: EventHint): PromiseLike<Event> => mockBrowserClient.eventFromException(_exception, _hint)
  };

  const hub = {
    getClient: () => client,
    getScope: () => scope,
    captureEvent: jest.fn(),
  };

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
import { Event, EventHint, SeverityLevel } from '@sentry/types';

import { ReactNativeErrorHandlers } from '../../src/js/integrations/reactnativeerrorhandlers';

beforeEach(() => {
  ErrorUtils.getGlobalHandler = () => jest.fn();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('ReactNativeErrorHandlers', () => {
  describe('onError', () => {
    test('Sets handled:false on a fatal error', async () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      let callback: (error: Error, isFatal: boolean) => Promise<void> = () =>
        Promise.resolve();

      ErrorUtils.setGlobalHandler = jest.fn((_callback) => {
        callback = _callback as typeof callback;
      });

      const integration = new ReactNativeErrorHandlers();

      integration.setupOnce();

      expect(ErrorUtils.setGlobalHandler).toHaveBeenCalledWith(callback);

      await callback(new Error('Test Error'), true);

      const hub = getCurrentHub();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const mockCall = (hub.captureEvent as jest.MockedFunction<
        typeof hub.captureEvent
      >).mock.calls[0];
      const event = mockCall[0];

      expect(event.level).toBe('fatal' as SeverityLevel);
      expect(event.exception?.values?.[0].mechanism?.handled).toBe(false);
      expect(event.exception?.values?.[0].mechanism?.type).toBe('onerror');
    });

    test('Does not set handled:false on a non-fatal error', async () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      let callback: (error: Error, isFatal: boolean) => Promise<void> = () =>
        Promise.resolve();

      ErrorUtils.setGlobalHandler = jest.fn((_callback) => {
        callback = _callback as typeof callback;
      });

      const integration = new ReactNativeErrorHandlers();

      integration.setupOnce();

      expect(ErrorUtils.setGlobalHandler).toHaveBeenCalledWith(callback);

      await callback(new Error('Test Error'), false);

      const hub = getCurrentHub();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const mockCall = (hub.captureEvent as jest.MockedFunction<
        typeof hub.captureEvent
      >).mock.calls[0];
      const event = mockCall[0];

      expect(event.level).toBe('error' as SeverityLevel);
      expect(event.exception?.values?.[0].mechanism?.handled).toBe(true);
      expect(event.exception?.values?.[0].mechanism?.type).toBe('generic');
    });
  });
});
