import type { ReactNativeClientOptions } from '../../src/js/options';

import { getDefaultIntegrations } from '../../src/js/integrations/default';

const getIntegrationNames = (overrides: Partial<ReactNativeClientOptions>): string[] =>
  getDefaultIntegrations({
    dsn: 'https://example.com/1',
    enableNative: true,
    ...overrides,
  } as ReactNativeClientOptions).map(integration => integration.name);

describe('getDefaultIntegrations - JS hang tracking integration', () => {
  it('adds the integration when enableJsHangTracking is true', () => {
    expect(getIntegrationNames({ enableJsHangTracking: true })).toContain('JsHangTracking');
  });

  it('does not add the integration by default', () => {
    expect(getIntegrationNames({})).not.toContain('JsHangTracking');
  });

  it('does not add the integration when native is disabled', () => {
    expect(getIntegrationNames({ enableNative: false, enableJsHangTracking: true })).not.toContain('JsHangTracking');
  });
});
