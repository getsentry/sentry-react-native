import { logger } from '@sentry/utils';

jest.mock('@sentry/react', () => {
  const actualModule = jest.requireActual('@sentry/react');

  const mockClient = {
    flush: jest.fn(() => Promise.resolve(true)),
  };

  return {
    ...actualModule,
    getCurrentHub: jest.fn(() => ({
      getClient: jest.fn(() => mockClient),
      setTag: jest.fn(),
    })),
    defaultIntegrations: [],
  };
});

jest.mock('@sentry/core', () => {
  const originalCore = jest.requireActual('@sentry/core');
  return {
    ...originalCore,
    initAndBind: jest.fn(),
  };
});

jest.mock('@sentry/hub', () => {
  const originalHub = jest.requireActual('@sentry/hub');
  return {
    ...originalHub,
    makeMain: jest.fn(),
  };
});

jest.mock('../src/js/scope', () => {
  return {
    ReactNativeScope: class ReactNativeScopeMock { },
  };
});

jest.mock('../src/js/client', () => {
  return {
    ReactNativeClient: class ReactNativeClientMock { },
  };
});

jest.spyOn(logger, 'error');

import { initAndBind } from '@sentry/core';
import { getCurrentHub } from '@sentry/react';

import { flush, init } from '../src/js/sdk';
import { ReactNativeTracing } from '../src/js/tracing';

afterEach(() => {
  jest.clearAllMocks();
});

describe('Tests the SDK functionality', () => {
  describe('init', () => {
    describe('enableAutoPerformanceTracking', () => {
      const autoPerformanceIsEnabled = (): boolean => {
        const mockCall = (initAndBind as jest.MockedFunction<
          typeof initAndBind
        >).mock.calls[0];

        if (mockCall) {
          const options = mockCall[1];

          return options.integrations?.some(
            (integration) => integration.name === ReactNativeTracing.id
          );
        }

        return false;
      };

      it('Auto Performance is enabled when tracing is enabled (tracesSampler)', () => {
        init({
          tracesSampler: () => true,
          enableAutoPerformanceTracking: true,
        });

        expect(autoPerformanceIsEnabled()).toBe(true);
      });

      it('Auto Performance is enabled when tracing is enabled (tracesSampleRate)', () => {
        init({
          tracesSampleRate: 0.5,
          enableAutoPerformanceTracking: true,
        });

        expect(autoPerformanceIsEnabled()).toBe(true);
      });
    });

    describe('flush', () => {
      it('Calls flush on the client', async () => {
        const mockClient = getCurrentHub().getClient();

        expect(mockClient).toBeTruthy();

        if (mockClient) {
          const flushResult = await flush();

          // eslint-disable-next-line @typescript-eslint/unbound-method
          expect(mockClient.flush).toBeCalled();
          expect(flushResult).toBe(true);
        }
      });

      it('Returns false if flush failed and logs error', async () => {
        const mockClient = getCurrentHub().getClient();

        expect(mockClient).toBeTruthy();
        if (mockClient) {
          mockClient.flush = jest.fn(() => Promise.reject());

          const flushResult = await flush();

          // eslint-disable-next-line @typescript-eslint/unbound-method
          expect(mockClient.flush).toBeCalled();
          expect(flushResult).toBe(false);
          // eslint-disable-next-line @typescript-eslint/unbound-method
          expect(logger.error).toBeCalledWith(
            'Failed to flush the event queue.'
          );
        }
      });
    });
  });
});
