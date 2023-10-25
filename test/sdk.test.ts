/**
 * @jest-environment jsdom
 */
import { logger } from '@sentry/utils';

import { NATIVE } from '../src/js/wrapper';

interface MockedClient {
  flush: jest.Mock;
}

let mockedGetCurrentHubWithScope: jest.Mock;
let mockedGetCurrentHubConfigureScope: jest.Mock;

jest.mock('@sentry/react', () => {
  const actualModule = jest.requireActual('@sentry/react');

  const mockClient: MockedClient = {
    flush: jest.fn(() => Promise.resolve(true)),
  };

  return {
    ...actualModule,
    getCurrentHub: jest.fn(() => {
      mockedGetCurrentHubWithScope = jest.fn();
      mockedGetCurrentHubConfigureScope = jest.fn();
      return {
        getClient: jest.fn(() => mockClient),
        setTag: jest.fn(),
        withScope: mockedGetCurrentHubWithScope,
        configureScope: mockedGetCurrentHubConfigureScope,
      };
    }),
    defaultIntegrations: [{ name: 'MockedDefaultReactIntegration', setupOnce: jest.fn() }],
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
    ReactNativeScope: class ReactNativeScopeMock {},
  };
});

jest.mock('../src/js/client', () => {
  return {
    ReactNativeClient: class ReactNativeClientMock {},
  };
});

jest.mock('../src/js/wrapper');

jest.spyOn(logger, 'error');

import { initAndBind } from '@sentry/core';
import { getCurrentHub, makeFetchTransport } from '@sentry/react';
import type { BaseTransportOptions, ClientOptions, Integration, Scope } from '@sentry/types';

import type { ReactNativeClientOptions } from '../src/js/options';
import { configureScope, flush, init, withScope } from '../src/js/sdk';
import { ReactNativeTracing, ReactNavigationInstrumentation } from '../src/js/tracing';
import { makeNativeTransport } from '../src/js/transports/native';
import { firstArg, secondArg } from './testutils';

const mockedInitAndBind = initAndBind as jest.MockedFunction<typeof initAndBind>;
const usedOptions = (): ClientOptions<BaseTransportOptions> | undefined => {
  return mockedInitAndBind.mock.calls[0]?.[1];
};

describe('Tests the SDK functionality', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('init', () => {
    describe('enableAutoPerformanceTracing', () => {
      const usedOptions = (): Integration[] => {
        const mockCall = mockedInitAndBind.mock.calls[0];

        if (mockCall) {
          const options = mockCall[1];

          return options.integrations;
        }
        return [];
      };

      const autoPerformanceIsEnabled = (): boolean => {
        return usedOptions().some(integration => integration.name === ReactNativeTracing.id);
      };

      const reactNavigationInstrumentation = (): ReactNativeTracing => {
        const nav = new ReactNavigationInstrumentation();
        return new ReactNativeTracing({ routingInstrumentation: nav });
      };

      it('Auto Performance is enabled when tracing is enabled (tracesSampler)', () => {
        init({
          tracesSampler: () => true,
          enableAutoPerformanceTracing: true,
        });

        expect(autoPerformanceIsEnabled()).toBe(true);
      });

      it('Auto Performance is enabled when tracing is enabled (tracesSampleRate)', () => {
        init({
          tracesSampleRate: 0.5,
          enableAutoPerformanceTracing: true,
        });

        expect(autoPerformanceIsEnabled()).toBe(true);
      });

      it('Do not overwrite user defined integrations when passing integrations', () => {
        const tracing = reactNavigationInstrumentation();
        init({
          tracesSampleRate: 0.5,
          enableAutoPerformanceTracing: true,
          integrations: [tracing],
        });

        const options = usedOptions();
        expect(options.filter(integration => integration.name === ReactNativeTracing.id).length).toBe(1);
        expect(options.some(integration => integration === tracing)).toBe(true);
      });

      it('Do not overwrite user defined integrations when passing defaultIntegrations', () => {
        const tracing = reactNavigationInstrumentation();
        init({
          tracesSampleRate: 0.5,
          enableAutoPerformanceTracing: true,
          defaultIntegrations: [tracing],
        });

        const options = usedOptions();
        expect(options.filter(integration => integration.name === ReactNativeTracing.id).length).toBe(1);
        expect(options.some(integration => integration === tracing)).toBe(true);
      });
    });

    describe('flush', () => {
      it('Calls flush on the client', async () => {
        const mockClient = getMockClient();

        expect(mockClient).toBeTruthy();

        if (mockClient) {
          const flushResult = await flush();

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

          expect(mockClient.flush).toBeCalled();
          expect(flushResult).toBe(false);
          expect(logger.error).toBeCalledWith('Failed to flush the event queue.');
        }
      });
    });

    describe('environment', () => {
      it('detect development environment', () => {
        init({
          enableNative: true,
        });
        expect(usedOptions()?.environment).toBe('development');
      });

      it('uses custom environment', () => {
        init({
          environment: 'custom',
        });
        expect(usedOptions()?.environment).toBe('custom');
      });

      it('it keeps empty string environment', () => {
        init({
          environment: '',
        });
        expect(usedOptions()?.environment).toBe('');
      });

      it('it keeps undefined environment', () => {
        init({
          environment: undefined,
        });
        expect(usedOptions()?.environment).toBe(undefined);
      });
    });

    describe('transport options buffer size', () => {
      it('uses default transport options buffer size', () => {
        init({
          tracesSampleRate: 0.5,
          enableAutoPerformanceTracing: true,
        });
        expect(usedOptions()?.transportOptions?.bufferSize).toBe(30);
      });

      it('uses custom transport options buffer size', () => {
        init({
          transportOptions: {
            bufferSize: 99,
          },
        });
        expect(usedOptions()?.transportOptions?.bufferSize).toBe(99);
      });

      it('uses max queue size', () => {
        init({
          maxQueueSize: 88,
        });
        expect(usedOptions()?.transportOptions?.bufferSize).toBe(88);
      });
    });
  });

  describe('transport initialization', () => {
    describe('native SDK unavailable', () => {
      it('fetchTransport set and enableNative set to false', () => {
        (NATIVE.isNativeAvailable as jest.Mock).mockImplementation(() => false);
        init({});
        expect(NATIVE.isNativeAvailable).toBeCalled();
        // @ts-expect-error enableNative not publicly available here.
        expect(usedOptions()?.enableNative).toEqual(false);
        expect(usedOptions()?.transport).toEqual(makeFetchTransport);
      });

      it('fetchTransport set and passed enableNative ignored when true', () => {
        (NATIVE.isNativeAvailable as jest.Mock).mockImplementation(() => false);
        init({ enableNative: true });
        expect(NATIVE.isNativeAvailable).toBeCalled();
        // @ts-expect-error enableNative not publicly available here.
        expect(usedOptions()?.enableNative).toEqual(false);
        expect(usedOptions()?.transport).toEqual(makeFetchTransport);
      });

      it('fetchTransport set and isNativeAvailable not called when passed enableNative set to false', () => {
        (NATIVE.isNativeAvailable as jest.Mock).mockImplementation(() => false);
        init({ enableNative: false });
        expect(NATIVE.isNativeAvailable).not.toBeCalled();
        // @ts-expect-error enableNative not publicly available here.
        expect(usedOptions()?.enableNative).toEqual(false);
        expect(usedOptions()?.transport).toEqual(makeFetchTransport);
      });

      it('custom transport set and enableNative set to false', () => {
        (NATIVE.isNativeAvailable as jest.Mock).mockImplementation(() => false);
        const mockTransport = jest.fn();
        init({
          transport: mockTransport,
        });
        expect(usedOptions()?.transport).toEqual(mockTransport);
        expect(NATIVE.isNativeAvailable).toBeCalled();
        // @ts-expect-error enableNative not publicly available here.
        expect(usedOptions()?.enableNative).toEqual(false);
      });
    });

    it('uses transport from the options', () => {
      const mockTransport = jest.fn();
      init({
        transport: mockTransport,
      });
      expect(usedOptions()?.transport).toEqual(mockTransport);
    });

    it('uses native transport', () => {
      (NATIVE.isNativeAvailable as jest.Mock).mockImplementation(() => true);
      init({});
      expect(usedOptions()?.transport).toEqual(makeNativeTransport);
    });

    it('uses fallback fetch transport', () => {
      (NATIVE.isNativeAvailable as jest.Mock).mockImplementation(() => false);
      init({});
      expect(usedOptions()?.transport).toEqual(makeFetchTransport);
    });

    it('checks sdk options first', () => {
      (NATIVE.isNativeAvailable as jest.Mock).mockImplementation(() => true);
      init({ enableNative: false });
      expect(usedOptions()?.transport).toEqual(makeFetchTransport);
      expect(NATIVE.isNativeAvailable).not.toBeCalled();
    });

    it('check both options and native availability', () => {
      (NATIVE.isNativeAvailable as jest.Mock).mockImplementation(() => true);
      init({ enableNative: true });
      expect(usedOptions()?.transport).toEqual(makeNativeTransport);
      expect(NATIVE.isNativeAvailable).toBeCalled();
    });
  });

  describe('initIsSafe', () => {
    test('initialScope callback is safe after init', () => {
      const mockInitialScope = jest.fn(() => {
        throw 'Test error';
      });

      init({ initialScope: mockInitialScope });

      expect(() => {
        (mockedInitAndBind.mock.calls[0][secondArg].initialScope as (scope: Scope) => Scope)({} as any);
      }).not.toThrow();
      expect(mockInitialScope).toBeCalledTimes(1);
    });
    test('beforeBreadcrumb callback is safe after init', () => {
      const mockBeforeBreadcrumb = jest.fn(() => {
        throw 'Test error';
      });

      init({ beforeBreadcrumb: mockBeforeBreadcrumb });

      expect(() => {
        mockedInitAndBind.mock.calls[0][secondArg].beforeBreadcrumb?.({} as any);
      }).not.toThrow();
      expect(mockBeforeBreadcrumb).toBeCalledTimes(1);
    });

    test('integrations callback should not crash init', () => {
      const mockIntegrations = jest.fn(() => {
        throw 'Test error';
      });

      expect(() => {
        init({ integrations: mockIntegrations });
      }).not.toThrow();
      expect(mockIntegrations).toBeCalledTimes(1);
    });

    test('tracesSampler callback is safe after init', () => {
      const mockTraceSampler = jest.fn(() => {
        throw 'Test error';
      });

      init({ tracesSampler: mockTraceSampler });

      expect(() => {
        mockedInitAndBind.mock.calls[0][secondArg].tracesSampler?.({} as any);
      }).not.toThrow();
      expect(mockTraceSampler).toBeCalledTimes(1);
    });
  });

  describe('withScope', () => {
    test('withScope callback does not throw', () => {
      const mockScopeCallback = jest.fn(() => {
        throw 'Test error';
      });

      withScope(mockScopeCallback);

      expect(() => {
        (mockedGetCurrentHubWithScope.mock.calls[0][firstArg] as (scope: Scope) => void)({} as any);
      }).not.toThrow();
      expect(mockScopeCallback).toBeCalledTimes(1);
    });
  });

  describe('configureScope', () => {
    test('configureScope callback does not throw', () => {
      const mockScopeCallback = jest.fn(() => {
        throw 'Test error';
      });

      configureScope(mockScopeCallback);

      expect(() => {
        (mockedGetCurrentHubConfigureScope.mock.calls[0][firstArg] as (scope: Scope) => void)({} as any);
      }).not.toThrow();
      expect(mockScopeCallback).toBeCalledTimes(1);
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

    it('no http client integration by default', () => {
      init({});

      const actualOptions = mockedInitAndBind.mock.calls[0][secondArg] as ReactNativeClientOptions;
      const actualIntegrations = actualOptions.integrations;

      expect(actualIntegrations).toEqual(expect.not.arrayContaining([expect.objectContaining({ name: 'HttpClient' })]));
    });

    it('adds http client integration', () => {
      init({
        enableCaptureFailedRequests: true,
      });

      const actualOptions = mockedInitAndBind.mock.calls[0][secondArg] as ReactNativeClientOptions;
      const actualIntegrations = actualOptions.integrations;

      expect(actualIntegrations).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'HttpClient' })]));
    });

    it('user defined http client integration overwrites default', () => {
      init({
        enableCaptureFailedRequests: true,
        integrations: [
          <Integration>{
            name: 'HttpClient',
            setupOnce: () => {},
            isUserDefined: true,
          },
        ],
      });

      const actualOptions = mockedInitAndBind.mock.calls[0][secondArg] as ReactNativeClientOptions;
      const actualIntegrations = actualOptions.integrations;

      expect(actualIntegrations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'HttpClient',
            isUserDefined: true,
          }),
        ]),
      );
      expect(actualIntegrations.filter(integration => integration.name === 'HttpClient')).toHaveLength(1);
    });

    it('no screenshot integration by default', () => {
      init({});

      const actualOptions = mockedInitAndBind.mock.calls[0][secondArg] as ReactNativeClientOptions;
      const actualIntegrations = actualOptions.integrations;

      expect(actualIntegrations).toEqual(expect.not.arrayContaining([expect.objectContaining({ name: 'Screenshot' })]));
    });

    it('adds screenshot integration', () => {
      init({
        attachScreenshot: true,
      });

      const actualOptions = mockedInitAndBind.mock.calls[0][secondArg] as ReactNativeClientOptions;
      const actualIntegrations = actualOptions.integrations;

      expect(actualIntegrations).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Screenshot' })]));
    });

    it('no view hierarchy integration by default', () => {
      init({});

      const actualOptions = mockedInitAndBind.mock.calls[0][secondArg] as ReactNativeClientOptions;
      const actualIntegrations = actualOptions.integrations;

      expect(actualIntegrations).toEqual(
        expect.not.arrayContaining([expect.objectContaining({ name: 'ViewHierarchy' })]),
      );
    });

    it('adds view hierarchy integration', () => {
      init({
        attachViewHierarchy: true,
      });

      const actualOptions = mockedInitAndBind.mock.calls[0][secondArg] as ReactNativeClientOptions;
      const actualIntegrations = actualOptions.integrations;

      expect(actualIntegrations).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'ViewHierarchy' })]));
    });

    it('no profiling integration by default', () => {
      init({});

      const actualOptions = mockedInitAndBind.mock.calls[0][secondArg] as ReactNativeClientOptions;
      const actualIntegrations = actualOptions.integrations;
      expect(actualIntegrations).toEqual(
        expect.not.arrayContaining([expect.objectContaining({ name: 'HermesProfiling' })]),
      );
    });

    it('adds profiling integration', () => {
      init({
        _experiments: {
          profilesSampleRate: 0.7,
        },
      });

      const actualOptions = mockedInitAndBind.mock.calls[0][secondArg] as ReactNativeClientOptions;
      const actualIntegrations = actualOptions.integrations;
      expect(actualIntegrations).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'HermesProfiling' })]),
      );
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

      expect(actualIntegrations).toEqual(expect.arrayContaining([mockIntegration, mockDefaultIntegration])); // order doesn't matter
      expect(actualIntegrations.length).toBe(2); // there should be no extra unexpected integrations
    });

    it('merges with default integrations', () => {
      const mockIntegration = getMockedIntegration();
      init({
        integrations: [mockIntegration],
      });

      const actualOptions = mockedInitAndBind.mock.calls[0][secondArg] as ReactNativeClientOptions;
      const actualIntegrations = actualOptions.integrations;

      expect(actualIntegrations).toEqual(expect.arrayContaining([mockIntegration]));
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

      expect(actualIntegrations).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'MockedDefaultReactIntegration' })]),
      );
    });
  });
});

function getMockClient(): MockedClient {
  const mockClient = getCurrentHub().getClient() as unknown as MockedClient;
  return mockClient;
}

function getMockedIntegration({ name }: { name?: string } = {}): Integration {
  return {
    name: name ?? 'MockedIntegration',
    setupOnce: jest.fn(),
  };
}
