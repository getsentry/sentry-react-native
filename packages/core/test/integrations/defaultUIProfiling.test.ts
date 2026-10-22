import type { ReactNativeClientOptions } from '../../src/js/options';

import { getDefaultIntegrations } from '../../src/js/integrations/default';

const getIntegrationNames = (overrides: Partial<ReactNativeClientOptions>): string[] =>
  getDefaultIntegrations({
    dsn: 'https://example.com/1',
    enableNative: true,
    ...overrides,
  } as ReactNativeClientOptions).map(integration => integration.name);

describe('getDefaultIntegrations - UI profiling integration', () => {
  it('adds the integration when profilingOptions are set', () => {
    expect(getIntegrationNames({ _experiments: { profilingOptions: {} } })).toContain('ProfilingIntegration');
  });

  it('adds the integration when the deprecated androidProfilingOptions are set', () => {
    expect(getIntegrationNames({ _experiments: { androidProfilingOptions: {} } })).toContain('ProfilingIntegration');
  });

  it('does not add the integration without profilingOptions', () => {
    expect(getIntegrationNames({})).not.toContain('ProfilingIntegration');
  });

  it('does not add the integration when native is disabled', () => {
    expect(getIntegrationNames({ enableNative: false, _experiments: { profilingOptions: {} } })).not.toContain(
      'ProfilingIntegration',
    );
  });
});
