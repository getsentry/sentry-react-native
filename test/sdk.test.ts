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
import { Integration } from '@sentry/types';

import { flush, init } from '../src/js/sdk';
import { ReactNativeTracing, ReactNavigationInstrumentation } from '../src/js/tracing';

afterEach(() => {
  jest.clearAllMocks();
});

describe('Tests the SDK functionality', () => {
  describe('init', () => {
    describe('enableAutoPerformanceTracking', () => {
      const usedOptions = (): Integration[] => {
        const mockCall = (initAndBind as jest.MockedFunction<
          typeof initAndBind
          >).mock.calls[0];

          if (mockCall) {
            const options = mockCall[1];

            return options.integrations;
          }
        return [];
      }

      const autoPerformanceIsEnabled = (): boolean => {
        return usedOptions().some(
          (integration) => integration.name === ReactNativeTracing.id
        );
      };

      const reactNavigationInstrumentation = (): ReactNativeTracing => {
        const nav = new ReactNavigationInstrumentation();
        return new ReactNativeTracing({ routingInstrumentation: nav });
      }

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

      it('Do not overwrite user defined integrations when passing integrations', () => {
        const tracing = reactNavigationInstrumentation();
        init({
          tracesSampleRate: 0.5,
          enableAutoPerformanceTracking: true,
          integrations: [tracing],
        });

        const options = usedOptions();
        expect(options.filter((integration) => integration.name === ReactNativeTracing.id).length).toBe(1);
        expect(options.some((integration) => integration === tracing)).toBe(true);
      });

      it('Do not overwrite user defined integrations when passing defaultIntegrations', () => {
        const tracing = reactNavigationInstrumentation();
        init({
          tracesSampleRate: 0.5,
          enableAutoPerformanceTracking: true,
          defaultIntegrations: [tracing],
        });

        const options = usedOptions();
        expect(options.filter((integration) => integration.name === ReactNativeTracing.id).length).toBe(1);
        expect(options.some((integration) => integration === tracing)).toBe(true);
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
