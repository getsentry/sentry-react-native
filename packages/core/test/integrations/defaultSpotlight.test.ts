import type { Integration } from '@sentry/core';
import { getDefaultIntegrations } from '../../src/js/integrations/default';
import { spotlightIntegration } from '../../src/js/integrations/spotlight';
import type { ReactNativeClientOptions } from '../../src/js/options';
import { notWeb } from '../../src/js/utils/environment';

jest.mock('../../src/js/utils/environment', () => {
  const actual = jest.requireActual('../../src/js/utils/environment');
  return {
    ...actual,
    notWeb: jest.fn(() => true),
  };
});

const spotlightIntegrationName = spotlightIntegration().name;

describe('getDefaultIntegrations - spotlight integration', () => {
  let originalDev: boolean | undefined;

  beforeEach(() => {
    (notWeb as jest.Mock).mockReturnValue(true);
    originalDev = (global as typeof globalThis & { __DEV__?: boolean }).__DEV__;
  });

  afterEach(() => {
    (global as typeof globalThis & { __DEV__?: boolean }).__DEV__ = originalDev;
  });

  const createOptions = (overrides: Partial<ReactNativeClientOptions>): ReactNativeClientOptions => {
    return {
      dsn: 'https://example.com/1',
      enableNative: true,
      ...overrides,
    } as ReactNativeClientOptions;
  };

  const getIntegrationNames = (options: ReactNativeClientOptions): string[] => {
    const integrations = getDefaultIntegrations(options);
    return integrations.map((integration: Integration) => integration.name);
  };

  it('does not add spotlight integration when spotlight option is not set', () => {
    (global as typeof globalThis & { __DEV__?: boolean }).__DEV__ = true;
    const names = getIntegrationNames(createOptions({}));

    expect(names).not.toContain(spotlightIntegrationName);
  });

  it('adds spotlight integration when spotlight is true and __DEV__ is true', () => {
    (global as typeof globalThis & { __DEV__?: boolean }).__DEV__ = true;
    const names = getIntegrationNames(createOptions({ spotlight: true }));

    expect(names).toContain(spotlightIntegrationName);
  });

  it('adds spotlight integration when spotlight is a URL string and __DEV__ is true', () => {
    (global as typeof globalThis & { __DEV__?: boolean }).__DEV__ = true;
    const names = getIntegrationNames(createOptions({ spotlight: 'http://custom-url:8969/stream' }));

    expect(names).toContain(spotlightIntegrationName);
  });

  it('does not add spotlight integration when spotlight is true but __DEV__ is false', () => {
    (global as typeof globalThis & { __DEV__?: boolean }).__DEV__ = false;
    const names = getIntegrationNames(createOptions({ spotlight: true }));

    expect(names).not.toContain(spotlightIntegrationName);
  });

  it('does not add spotlight integration when spotlight is a URL but __DEV__ is false', () => {
    (global as typeof globalThis & { __DEV__?: boolean }).__DEV__ = false;
    const names = getIntegrationNames(createOptions({ spotlight: 'http://custom-url:8969/stream' }));

    expect(names).not.toContain(spotlightIntegrationName);
  });

  it('does not add spotlight integration when spotlight is false regardless of __DEV__', () => {
    (global as typeof globalThis & { __DEV__?: boolean }).__DEV__ = true;
    const names = getIntegrationNames(createOptions({ spotlight: false }));

    expect(names).not.toContain(spotlightIntegrationName);
  });
});
