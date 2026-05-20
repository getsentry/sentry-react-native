import type { Integration } from '@sentry/core';

import type { ReactNativeClientOptions } from '../../src/js/options';

import { getDefaultIntegrations } from '../../src/js/integrations/default';
import { notWeb } from '../../src/js/utils/environment';

jest.mock('../../src/js/utils/environment', () => {
  const actual = jest.requireActual('../../src/js/utils/environment');
  return {
    ...actual,
    notWeb: jest.fn(() => true),
  };
});

const EXPO_ROUTER_INTEGRATION_NAME = 'ExpoRouter';

describe('getDefaultIntegrations - expo-router integration', () => {
  beforeEach(() => {
    (notWeb as jest.Mock).mockReturnValue(true);
  });

  const createOptions = (overrides: Partial<ReactNativeClientOptions>): ReactNativeClientOptions => {
    return {
      dsn: 'https://example.com/1',
      enableNative: true,
      ...overrides,
    } as ReactNativeClientOptions;
  };

  const getNames = (options: ReactNativeClientOptions): string[] =>
    getDefaultIntegrations(options).map((i: Integration) => i.name);

  it('adds expoRouterIntegration when tracing and auto performance tracing are enabled', () => {
    const names = getNames(
      createOptions({
        tracesSampleRate: 1.0,
        enableAutoPerformanceTracing: true,
      }),
    );
    expect(names).toContain(EXPO_ROUTER_INTEGRATION_NAME);
  });

  it('does not add expoRouterIntegration when tracing is disabled', () => {
    const names = getNames(
      createOptions({
        enableAutoPerformanceTracing: true,
      }),
    );
    expect(names).not.toContain(EXPO_ROUTER_INTEGRATION_NAME);
  });

  it('does not add expoRouterIntegration when auto performance tracing is disabled', () => {
    const names = getNames(
      createOptions({
        tracesSampleRate: 1.0,
        enableAutoPerformanceTracing: false,
      }),
    );
    expect(names).not.toContain(EXPO_ROUTER_INTEGRATION_NAME);
  });
});
