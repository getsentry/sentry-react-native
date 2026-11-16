import type { ReactNativeClientOptions } from '../../src/js/options';

import { getDefaultIntegrations } from '../../src/js/integrations/default';
import { jsHangTrackingIntegration } from '../../src/js/integrations/jsHangTracking';

jest.mock('../../src/js/integrations/jsHangTracking', () => {
  const actual = jest.requireActual('../../src/js/integrations/jsHangTracking');
  return { jsHangTrackingIntegration: jest.fn(actual.jsHangTrackingIntegration) };
});

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

  it('passes the JS hang options to the integration', () => {
    getIntegrationNames({ enableJsHangTracking: true, jsHangTimeoutInterval: 3, attachJsHangFlamegraph: true });

    expect(jsHangTrackingIntegration).toHaveBeenCalledWith({ timeoutIntervalSeconds: 3, attachFlamegraph: true });
  });

  it('does not add the integration by default', () => {
    expect(getIntegrationNames({})).not.toContain('JsHangTracking');
  });

  it('does not add the integration when native is disabled', () => {
    expect(getIntegrationNames({ enableNative: false, enableJsHangTracking: true })).not.toContain('JsHangTracking');
  });
});
