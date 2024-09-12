import { initAndBind } from '@sentry/core';
import { makeFetchTransport } from '@sentry/react';
import type { BaseTransportOptions, ClientOptions, Integration, Scope } from '@sentry/types';
import { logger } from '@sentry/utils';

import { init, withScope } from '../src/js/sdk';
import type { ReactNativeTracingIntegration } from '../src/js/tracing';
import { REACT_NATIVE_TRACING_INTEGRATION_NAME, reactNativeTracingIntegration } from '../src/js/tracing';
import { makeNativeTransport } from '../src/js/transports/native';
import { getDefaultEnvironment, isExpoGo, notWeb } from '../src/js/utils/environment';
import { NATIVE } from './mockWrapper';
import { firstArg, secondArg } from './testutils';

jest.spyOn(logger, 'error');
jest.mock('../src/js/wrapper', () => jest.requireActual('./mockWrapper'));
jest.mock('../src/js/utils/environment');
jest.mock('@sentry/core', () => ({
  ...jest.requireActual('@sentry/core'),
  initAndBind: jest.fn(),
}));

describe('Tests the SDK functionality', () => {
  beforeEach(() => {
    (NATIVE.isNativeAvailable as jest.Mock).mockImplementation(() => true);
    (notWeb as jest.Mock).mockImplementation(() => true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('init', () => {
    describe('enableAutoPerformanceTracing', () => {
      const reactNavigationInstrumentation = (): ReactNativeTracingIntegration => {
        return reactNativeTracingIntegration();
      };

      it('Auto Performance is disabled by default', () => {
        init({});

        expect(autoPerformanceIsEnabled()).toBe(false);
      });

      it('Auto Performance is disabled when tracesSampleRate is set to undefined', () => {
        init({
          tracesSampleRate: undefined,
        });

        expect(autoPerformanceIsEnabled()).toBe(false);
      });

      it('Auto Performance is disabled when tracesSampler is set to undefined', () => {
        init({
          tracesSampler: undefined,
        });

        expect(autoPerformanceIsEnabled()).toBe(false);
      });

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

        const options = usedIntegrations();
        expect(options.filter(integration => integration.name === REACT_NATIVE_TRACING_INTEGRATION_NAME).length).toBe(
          1,
        );
        expect(options.some(integration => integration === tracing)).toBe(true);
      });

      it('Do not overwrite user defined integrations when passing defaultIntegrations', () => {
        const tracing = reactNavigationInstrumentation();
        init({
          tracesSampleRate: 0.5,
          enableAutoPerformanceTracing: true,
          defaultIntegrations: [tracing],
        });

        const options = usedIntegrations();
        expect(options.filter(integration => integration.name === REACT_NATIVE_TRACING_INTEGRATION_NAME).length).toBe(
          1,
        );
        expect(options.some(integration => integration === tracing)).toBe(true);
      });
    });

    describe('environment', () => {
      it('detect development environment', () => {
        (getDefaultEnvironment as jest.Mock).mockImplementation(() => 'development');
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
        (usedOptions()?.initialScope as (scope: Scope) => Scope)({} as any);
      }).not.toThrow();
      expect(mockInitialScope).toBeCalledTimes(1);
    });
    test('beforeBreadcrumb callback is safe after init', () => {
      const mockBeforeBreadcrumb = jest.fn(() => {
        throw 'Test error';
      });

      init({ beforeBreadcrumb: mockBeforeBreadcrumb });

      expect(() => {
        usedOptions()?.beforeBreadcrumb?.({} as any);
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
        usedOptions()?.tracesSampler?.({} as any);
      }).not.toThrow();
      expect(mockTraceSampler).toBeCalledTimes(1);
    });
  });

  describe('withScope', () => {
    test('withScope callback does not throw', () => {
      const mockScopeCallback = jest.fn(() => {
        throw 'Test error';
      });

      expect(() => withScope(mockScopeCallback)).not.toThrow();
      expect(mockScopeCallback).toBeCalledTimes(1);
    });
  });

  describe('integrations', () => {
    it('replaces default integrations', () => {
      const mockDefaultIntegration = createMockedIntegration();
      init({
        defaultIntegrations: [mockDefaultIntegration],
      });

      const actualOptions = usedOptions();
      const actualIntegrations = actualOptions?.integrations;

      expect(actualIntegrations).toEqual([mockDefaultIntegration]);
    });

    it('no http client integration by default', () => {
      init({});

      expectNotIntegration('HttpClient');
    });

    it('adds http client integration', () => {
      init({
        enableCaptureFailedRequests: true,
      });

      expectIntegration('HttpClient');
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

      const actualOptions = usedOptions();
      const actualIntegrations = actualOptions?.integrations;

      expect(actualIntegrations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'HttpClient',
            isUserDefined: true,
          }),
        ]),
      );
      expect(actualIntegrations?.filter(integration => integration.name === 'HttpClient')).toHaveLength(1);
    });

    it('no screenshot integration by default', () => {
      init({});

      expectNotIntegration('Screenshot');
    });

    it('adds screenshot integration', () => {
      init({
        attachScreenshot: true,
      });

      expectIntegration('Screenshot');
    });

    it('no view hierarchy integration by default', () => {
      init({});

      expectNotIntegration('ViewHierarchy');
    });

    it('adds view hierarchy integration', () => {
      init({
        attachViewHierarchy: true,
      });

      expectIntegration('ViewHierarchy');
    });

    it('no profiling integration by default', () => {
      init({});

      expectNotIntegration('HermesProfiling');
    });

    it('adds profiling integration', () => {
      init({
        profilesSampleRate: 0.7,
      });

      expectIntegration('HermesProfiling');
    });

    it('no spotlight integration by default', () => {
      init({});

      expectNotIntegration('Spotlight');
    });

    it('no app start integration by default', () => {
      init({});

      expectNotIntegration('AppStart');
    });

    it('when tracing enabled app start integration added by default', () => {
      init({
        tracesSampleRate: 0.5,
      });

      expectIntegration('AppStart');
    });

    it('when tracing enabled and app start disabled the integration is not added', () => {
      init({
        tracesSampleRate: 0.5,
        enableAppStartTracking: false,
      });

      expectNotIntegration('AppStart');
    });

    it('no native frames integration by default', () => {
      init({});

      expectNotIntegration('NativeFrames');
    });

    it('when tracing enabled native frames integration added by default', () => {
      init({
        tracesSampleRate: 0.5,
      });

      expectIntegration('NativeFrames');
    });

    it('when tracing enabled and native frames disabled the integration is not added', () => {
      init({
        tracesSampleRate: 0.5,
        enableNativeFramesTracking: false,
      });

      expectNotIntegration('NativeFrames');
    });

    it('when tracing not set stall tracking the integration is not added', () => {
      init({});

      expectNotIntegration('StallTracking');
    });

    it('when tracing enabled stall tracking integration added by default', () => {
      init({
        tracesSampleRate: 0.5,
      });

      expectIntegration('StallTracking');
    });

    it('when tracing enabled and stall tracking disabled the integration is not added', () => {
      init({
        tracesSampleRate: 0.5,
        enableStallTracking: false,
      });

      expectNotIntegration('StallTracking');
    });

    describe('user interaction integration', () => {
      test('no integration when tracing disabled', () => {
        init({});

        expectNotIntegration('UserInteraction');
      });
      test('no integration when tracing enabled', () => {
        init({
          tracesSampleRate: 0.5,
        });

        expectNotIntegration('UserInteraction');
      });

      test('no integration when tracing enabled but user interaction explicitly disabled', () => {
        init({
          tracesSampleRate: 0.5,
          enableUserInteractionTracing: false,
        });

        expectNotIntegration('UserInteraction');
      });

      test('integration added when tracing enabled and user interaction enabled', () => {
        init({
          tracesSampleRate: 0.5,
          enableUserInteractionTracing: true,
        });

        expectIntegration('UserInteraction');
      });
    });

    it('adds spotlight integration with spotlight bool', () => {
      init({
        spotlight: true,
      });

      const actualOptions = usedOptions();
      const actualIntegrations = actualOptions?.integrations;
      expect(actualIntegrations).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Spotlight' })]));
    });

    it('adds spotlight integration with direct url', () => {
      init({
        spotlight: 'http://localhost:8969/stream',
      });

      const actualOptions = usedOptions();
      const actualIntegrations = actualOptions?.integrations;
      expect(actualIntegrations).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Spotlight' })]));
    });

    it('no default integrations', () => {
      init({
        defaultIntegrations: false,
      });

      const actualOptions = usedOptions();
      const actualIntegrations = actualOptions?.integrations;

      expect(actualIntegrations).toEqual([]);
    });

    it('merges with passed default integrations', () => {
      const mockIntegration = createMockedIntegration();
      const mockDefaultIntegration = createMockedIntegration({ name: 'MockedDefaultIntegration' });
      init({
        integrations: [mockIntegration],
        defaultIntegrations: [mockDefaultIntegration],
      });

      const actualOptions = usedOptions();
      const actualIntegrations = actualOptions?.integrations;

      expect(actualIntegrations).toEqual(expect.arrayContaining([mockIntegration, mockDefaultIntegration])); // order doesn't matter
      expect(actualIntegrations?.length).toBe(2); // there should be no extra unexpected integrations
    });

    it('merges with default integrations', () => {
      const mockIntegration = createMockedIntegration();
      init({
        integrations: [mockIntegration],
      });

      const actualOptions = usedOptions();
      const actualIntegrations = actualOptions?.integrations;

      expect(actualIntegrations).toEqual(expect.arrayContaining([mockIntegration]));
      expect(actualIntegrations?.length).toBeGreaterThan(1); // there should be default integrations + the test one
    });

    it('passes default integrations to the function', () => {
      const mockIntegration = createMockedIntegration();
      const mockIntegrationFactory = jest.fn((_integrations: Integration[]) => [mockIntegration]);
      init({
        integrations: mockIntegrationFactory,
      });

      const actualPassedIntegrations = mockIntegrationFactory.mock.calls[0][firstArg];

      expect(actualPassedIntegrations.length).toBeGreaterThan(0);

      const actualOptions = usedOptions();
      const actualIntegrations = actualOptions?.integrations;

      expect(actualIntegrations).toEqual([mockIntegration]);
    });

    it('passes custom default integrations to the function', () => {
      const mockIntegration = createMockedIntegration();
      const mockDefaultIntegration = createMockedIntegration({ name: 'MockedDefaultIntegration' });
      const mockIntegrationFactory = jest.fn((_integrations: Integration[]) => [mockIntegration]);
      init({
        integrations: mockIntegrationFactory,
        defaultIntegrations: [mockDefaultIntegration],
      });

      const actualPassedIntegrations = mockIntegrationFactory.mock.calls[0][firstArg];

      expect(actualPassedIntegrations).toEqual([mockDefaultIntegration]);

      const actualOptions = usedOptions();
      const actualIntegrations = actualOptions?.integrations;

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

      expectIntegration('InboundFilters');
      expectIntegration('FunctionToString');
      expectIntegration('Breadcrumbs');
      expectIntegration('Dedupe');
      expectIntegration('HttpContext');
    });

    it('adds all platform default integrations', () => {
      init({});

      expectIntegration('Release');
      expectIntegration('EventOrigin');
      expectIntegration('SdkInfo');
      expectIntegration('ReactNativeInfo');
    });

    it('adds web platform specific default integrations', () => {
      (notWeb as jest.Mock).mockImplementation(() => false);
      init({});

      expectIntegration('BrowserApiErrors');
      expectIntegration('GlobalHandlers');
      expectIntegration('LinkedErrors');
    });

    it('does not add native integrations if native disabled', () => {
      (NATIVE.isNativeAvailable as jest.Mock).mockImplementation(() => false);
      init({
        attachScreenshot: true,
        attachViewHierarchy: true,
        profilesSampleRate: 0.7,
      });

      expectNotIntegration('DeviceContext');
      expectNotIntegration('ModulesLoader');
      expectNotIntegration('Screenshot');
      expectNotIntegration('ViewHierarchy');
      expectNotIntegration('HermesProfiling');
    });
  });

  it('adds expo context integration if expo go is detected', () => {
    (isExpoGo as jest.Mock).mockImplementation(() => true);
    init({});

    expectIntegration('ExpoContext');
  });
});

function expectIntegration(name: string): void {
  const actualOptions = usedOptions();
  const actualIntegrations = actualOptions?.integrations;
  expect(actualIntegrations).toEqual(expect.arrayContaining([expect.objectContaining({ name })]));
}

function expectNotIntegration(name: string): void {
  const actualOptions = usedOptions();
  const actualIntegrations = actualOptions?.integrations;
  expect(actualIntegrations).toEqual(expect.not.arrayContaining([expect.objectContaining({ name })]));
}

function createMockedIntegration({ name }: { name?: string } = {}): Integration {
  return {
    name: name ?? 'MockedIntegration',
    setupOnce: jest.fn(),
  };
}

function usedOptions(): ClientOptions<BaseTransportOptions> | undefined {
  return (initAndBind as jest.MockedFunction<typeof initAndBind>).mock.calls[0]?.[secondArg];
}

function usedIntegrations(): Integration[] {
  return usedOptions()?.integrations ?? [];
}

function autoPerformanceIsEnabled(): boolean {
  return usedIntegrations().some(integration => integration.name === REACT_NATIVE_TRACING_INTEGRATION_NAME);
}
