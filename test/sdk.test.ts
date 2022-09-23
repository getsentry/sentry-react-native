import { logger } from '@sentry/utils';

interface MockedClient {
  flush: jest.Mock;
}

jest.mock('@sentry/react', () => {
  const actualModule = jest.requireActual('@sentry/react');

  const mockClient: MockedClient = {
    flush: jest.fn(() => Promise.resolve(true)),
  };

  return {
    ...actualModule,
    getCurrentHub: jest.fn(() => ({
      getClient: jest.fn(() => mockClient),
      setTag: jest.fn(),
    })),
    defaultIntegrations: [ { name: 'MockedDefaultReactIntegration', setupOnce: jest.fn() } ],
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

import { ReactNativeClientOptions } from '../src/js/options';
import { flush, init } from '../src/js/sdk';
import { ReactNativeTracing, ReactNavigationInstrumentation } from '../src/js/tracing';
import { firstArg, secondArg } from './testutils';

const mockedInitAndBind = initAndBind as jest.MockedFunction<typeof initAndBind>;

afterEach(() => {
  jest.clearAllMocks();
});

describe('Tests the SDK functionality', () => {
  describe('init', () => {
    describe('enableAutoPerformanceTracking', () => {
      const usedOptions = (): Integration[] => {
        const mockCall = mockedInitAndBind.mock.calls[0];

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
        const mockClient = getMockClient();

        expect(mockClient).toBeTruthy();

        if (mockClient) {
          const flushResult = await flush();

          // eslint-disable-next-line @typescript-eslint/unbound-method
          expect(mockClient.flush).toBeCalled();
          expect(flushResult).toBe(true);
        }
      });

      it('Returns false if flush failed and logs error', async () => {
        const mockClient = getMockClient();

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

  describe('integrations', () => {
    it('replaces default integrations', () => {
      const mockDefaultIntegration = getMockedIntegration();
      init({
        defaultIntegrations: [mockDefaultIntegration],
      });

      const actualOptions = mockedInitAndBind.mock.calls[0][secondArg] as ReactNativeClientOptions;
      const actualIntegrations = actualOptions.integrations;

      expect(actualIntegrations).toEqual([mockDefaultIntegration]);
    });

    it('no default integrations', () => {
      init({
        defaultIntegrations: false,
      });

      const actualOptions = mockedInitAndBind.mock.calls[0][secondArg] as ReactNativeClientOptions;
      const actualIntegrations = actualOptions.integrations;

      expect(actualIntegrations).toEqual([]);
    });

    it('merges with passed default integrations', () => {
      const mockIntegration = getMockedIntegration();
      const mockDefaultIntegration = getMockedIntegration({ name: 'MockedDefaultIntegration' });
      init({
        integrations: [mockIntegration],
        defaultIntegrations: [mockDefaultIntegration],
      });

      const actualOptions = mockedInitAndBind.mock.calls[0][secondArg] as ReactNativeClientOptions;
      const actualIntegrations = actualOptions.integrations;

      expect(actualIntegrations)
        .toEqual(expect.arrayContaining([mockIntegration, mockDefaultIntegration])); // order doesn't matter
      expect(actualIntegrations.length).toBe(2); // there should be no extra unexpected integrations
    });

    it('merges with default integrations', () => {
      const mockIntegration = getMockedIntegration();
      init({
        integrations: [mockIntegration],
      });

      const actualOptions = mockedInitAndBind.mock.calls[0][secondArg] as ReactNativeClientOptions;
      const actualIntegrations = actualOptions.integrations;

      expect(actualIntegrations)
        .toEqual(expect.arrayContaining([mockIntegration]));
      expect(actualIntegrations.length).toBeGreaterThan(1); // there should be default integrations + the test one
    });

    it('passes default integrations to the function', () => {
      const mockIntegration = getMockedIntegration();
      const mockIntegrationFactory = jest.fn((_integrations: Integration[]) => [mockIntegration]);
      init({
        integrations: mockIntegrationFactory,
      });

      const actualPassedIntegrations = mockIntegrationFactory.mock.calls[0][firstArg];

      expect(actualPassedIntegrations.length).toBeGreaterThan(0);

      const actualOptions = mockedInitAndBind.mock.calls[0][secondArg] as ReactNativeClientOptions;
      const actualIntegrations = actualOptions.integrations;

      expect(actualIntegrations).toEqual([mockIntegration]);
    });

    it('passes custom default integrations to the function', () => {
      const mockIntegration = getMockedIntegration();
      const mockDefaultIntegration = getMockedIntegration({ name: 'MockedDefaultIntegration' });
      const mockIntegrationFactory = jest.fn((_integrations: Integration[]) => [mockIntegration]);
      init({
        integrations: mockIntegrationFactory,
        defaultIntegrations: [mockDefaultIntegration],
      });

      const actualPassedIntegrations = mockIntegrationFactory.mock.calls[0][firstArg];

      expect(actualPassedIntegrations).toEqual([mockDefaultIntegration]);

      const actualOptions = mockedInitAndBind.mock.calls[0][secondArg] as ReactNativeClientOptions;
      const actualIntegrations = actualOptions.integrations;

      expect(actualIntegrations).toEqual([mockIntegration]);
    });

    it('passes no defaults to the function', () => {
      const mockIntegrationFactory = jest.fn((_integrations: Integration[]) => []);
      init({
        integrations: mockIntegrationFactory,
        defaultIntegrations: false,
      });

      const actualPassedIntegrations = mockIntegrationFactory.mock.calls[0][firstArg];

      expect(actualPassedIntegrations).toEqual([]);
    });

    it('adds react default integrations', () => {
      init({});

      const actualOptions = mockedInitAndBind.mock.calls[0][secondArg] as ReactNativeClientOptions;
      const actualIntegrations = actualOptions.integrations;

      expect(actualIntegrations)
        .toEqual(expect.arrayContaining([expect.objectContaining({ name: 'MockedDefaultReactIntegration' })]));
    });
  });
});

function getMockClient(): MockedClient {
  const mockClient = getCurrentHub().getClient() as unknown as MockedClient;
  return mockClient;
}

function getMockedIntegration({name}: { name?: string } = {}): Integration {
  return {
    name: name ?? 'MockedIntegration',
    setupOnce: jest.fn(),
  };
}
