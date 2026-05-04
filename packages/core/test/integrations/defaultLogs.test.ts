import type { Integration } from '@sentry/core';

import { consoleLoggingIntegration } from '@sentry/browser';

import type { ReactNativeClientOptions } from '../../src/js/options';

import { getDefaultIntegrations } from '../../src/js/integrations/default';
import { logEnricherIntegration } from '../../src/js/integrations/logEnricherIntegration';
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

  it('does not add logEnricher when enableLogs is false', () => {
    const names = getIntegrationNames(createOptions({ enableLogs: false }));

    expect(names).not.toContain(logEnricherIntegrationName);
    expect(names).not.toContain(consoleLoggingIntegrationName);
  });

  it('adds logEnricher when enableLogs is true and logsOrigin is not native', () => {
    const names = getIntegrationNames(createOptions({ enableLogs: true }));

    expect(names).toContain(logEnricherIntegrationName);
  });

  it('never adds consoleLoggingIntegration by default — it must be opt-in', () => {
    const names = getIntegrationNames(createOptions({ enableLogs: true }));

    expect(names).not.toContain(consoleLoggingIntegrationName);
  });

  it('does not add logEnricher when logsOrigin is native', () => {
    const names = getIntegrationNames(
      createOptions({
        enableLogs: true,
        logsOrigin: 'native' as unknown as ReactNativeClientOptions['logsOrigin'],
      }),
    );

    expect(names).not.toContain(logEnricherIntegrationName);
    expect(names).not.toContain(consoleLoggingIntegrationName);
  });

  it.each([
    ['all', true],
    ['js', true],
    ['native', false],
  ])('handles logsOrigin %s correctly', (logsOrigin, shouldInclude) => {
    const names = getIntegrationNames(
      createOptions({
        enableLogs: true,
        logsOrigin: logsOrigin as unknown as ReactNativeClientOptions['logsOrigin'],
      }),
    );

    expect(names.includes(logEnricherIntegrationName)).toBe(shouldInclude);
    // consoleLoggingIntegration is always opt-in regardless of logsOrigin
    expect(names).not.toContain(consoleLoggingIntegrationName);
  });
});
