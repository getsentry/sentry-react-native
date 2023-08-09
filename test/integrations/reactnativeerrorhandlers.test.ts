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
    eventFromException: (_exception: any, _hint?: EventHint): PromiseLike<Event> =>
      mockBrowserClient.eventFromException(_exception, _hint),
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
import type { Event, EventHint, SeverityLevel } from '@sentry/types';

import { ReactNativeErrorHandlers } from '../../src/js/integrations/reactnativeerrorhandlers';

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
});

function getActualCaptureEventArgs() {
  const hub = getCurrentHub();
  const mockCall = (hub.captureEvent as jest.MockedFunction<typeof hub.captureEvent>).mock.calls[0];

  return mockCall;
}
