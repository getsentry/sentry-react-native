import { consoleLoggingIntegration } from '@sentry/browser';
import type { Integration } from '@sentry/core';
import { getDefaultIntegrations } from '../../src/js/integrations/default';
import { logEnricherIntegration } from '../../src/js/integrations/logEnricherIntegration';
import type { ReactNativeClientOptions } from '../../src/js/options';
import { notWeb } from '../../src/js/utils/environment';

jest.mock('../../src/js/utils/environment', () => {
  const actual = jest.requireActual('../../src/js/utils/environment');
  return {
    ...actual,
    notWeb: jest.fn(() => true),
  };
});

const logEnricherIntegrationName = logEnricherIntegration().name;
const consoleLoggingIntegrationName = consoleLoggingIntegration().name;

describe('getDefaultIntegrations - logging integrations', () => {
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

  const getIntegrationNames = (options: ReactNativeClientOptions): string[] => {
    const integrations = getDefaultIntegrations(options);
    return integrations.map((integration: Integration) => integration.name);
  };

  it('does not add logging integrations when enableLogs is falsy', () => {
    const names = getIntegrationNames(createOptions({ enableLogs: false }));

    expect(names).not.toContain(logEnricherIntegrationName);
    expect(names).not.toContain(consoleLoggingIntegrationName);
  });

  it('adds logging integrations when enableLogs is true and loggerOrigin is not native', () => {
    const names = getIntegrationNames(createOptions({ enableLogs: true }));

    expect(names).toContain(logEnricherIntegrationName);
    expect(names).toContain(consoleLoggingIntegrationName);
  });

  it('does not add logging integrations when loggerOrigin is native', () => {
    const names = getIntegrationNames(
      createOptions({ enableLogs: true, loggerOrigin: 'native' as unknown as ReactNativeClientOptions['loggerOrigin'] }),
    );

    expect(names).not.toContain(logEnricherIntegrationName);
    expect(names).not.toContain(consoleLoggingIntegrationName);
  });

  it.each([
    ['all', true],
    ['js', true],
    ['native', false],
  ])('handles loggerOrigin %s correctly', (loggerOrigin, shouldInclude) => {
    const names = getIntegrationNames(
      createOptions({
        enableLogs: true,
        loggerOrigin: loggerOrigin as unknown as ReactNativeClientOptions['loggerOrigin'],
      }),
    );

    expect(names.includes(logEnricherIntegrationName)).toBe(shouldInclude);
    expect(names.includes(consoleLoggingIntegrationName)).toBe(shouldInclude);
  });
});

