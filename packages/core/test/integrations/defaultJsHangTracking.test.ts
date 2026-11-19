import { setCurrentClient } from '@sentry/core';

import type { ReactNativeClientOptions } from '../../src/js/options';

import { getDefaultIntegrations } from '../../src/js/integrations/default';
import { getDebugMetadata } from '../../src/js/profiling/debugid';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';
import { NATIVE } from '../mockWrapper';

jest.mock('../../src/js/wrapper', () => jest.requireActual('../mockWrapper'));
jest.mock('../../src/js/profiling/debugid');

const getDefaultIntegrationsFor = (overrides: Partial<ReactNativeClientOptions>) =>
  getDefaultIntegrations({
    dsn: 'https://example.com/1',
    enableNative: true,
    ...overrides,
  } as ReactNativeClientOptions);

const getIntegrationNames = (overrides: Partial<ReactNativeClientOptions>): string[] =>
  getDefaultIntegrationsFor(overrides).map(integration => integration.name);

describe('getDefaultIntegrations - JS hang tracking integration', () => {
  // @ts-expect-error __DEV__ is a global
  const originalDev = globalThis.__DEV__;

  beforeEach(() => {
    (getDebugMetadata as jest.MockedFunction<typeof getDebugMetadata>).mockReturnValue([]);
    // @ts-expect-error __DEV__ is a global
    globalThis.__DEV__ = false;
  });

  afterEach(() => {
    jest.clearAllMocks();
    // @ts-expect-error __DEV__ is a global
    globalThis.__DEV__ = originalDev;
  });

  it('adds the integration when enableJsHangTracking is true', () => {
    expect(getIntegrationNames({ enableJsHangTracking: true })).toContain('JsHangTracking');
  });

  it('passes the JS hang options to native tracking', () => {
    const integrations = getDefaultIntegrationsFor({
      enableJsHangTracking: true,
      jsHangTimeoutInterval: 3,
      attachJsHangFlamegraph: true,
    }).filter(integration => integration.name === 'JsHangTracking');
    const client = new TestClient(getDefaultTestClientOptions({ integrations }));
    setCurrentClient(client);
    client.init();

    // @ts-expect-error Only available on ReactNativeClient
    client.emit('afterInit');

    expect(NATIVE.setAttachJsHangFlamegraph).toHaveBeenCalledWith(true);
    expect(NATIVE.startJsHangTracking).toHaveBeenCalledWith(3000, null);
  });

  it('does not add the integration by default', () => {
    expect(getIntegrationNames({})).not.toContain('JsHangTracking');
  });

  it('does not add the integration when native is disabled', () => {
    expect(getIntegrationNames({ enableNative: false, enableJsHangTracking: true })).not.toContain('JsHangTracking');
  });
});
