import type { ReactNativeClientOptions } from '../../src/js/options';

import { getDefaultIntegrations } from '../../src/js/integrations/default';
import { appStartIntegration } from '../../src/js/integrations/exports';

jest.mock('../../src/js/integrations/exports', () => {
  const actual = jest.requireActual('../../src/js/integrations/exports');
  return {
    ...actual,
    appStartIntegration: jest.fn(() => ({ name: 'AppStart' })),
  };
});

describe('getDefaultIntegrations - standalone app start wiring', () => {
  beforeEach(() => {
    (appStartIntegration as jest.Mock).mockClear();
  });

  const createOptions = (overrides: Partial<ReactNativeClientOptions>): ReactNativeClientOptions =>
    ({
      dsn: 'https://example.com/1',
      enableNative: true,
      enableAppStartTracking: true,
      tracesSampleRate: 1.0,
      ...overrides,
    }) as ReactNativeClientOptions;

  it('creates a non-standalone app start integration by default', () => {
    getDefaultIntegrations(createOptions({}));

    expect(appStartIntegration).toHaveBeenCalledWith({ standalone: false });
  });

  it('creates a standalone app start integration when the experiment flag is enabled', () => {
    getDefaultIntegrations(createOptions({ _experiments: { enableStandaloneAppStartTracing: true } }));

    expect(appStartIntegration).toHaveBeenCalledWith({ standalone: true });
  });

  it('creates a non-standalone app start integration when the experiment flag is false', () => {
    getDefaultIntegrations(createOptions({ _experiments: { enableStandaloneAppStartTracing: false } }));

    expect(appStartIntegration).toHaveBeenCalledWith({ standalone: false });
  });

  it('includes the StandaloneAppStart marker when the experiment flag is enabled', () => {
    const integrations = getDefaultIntegrations(
      createOptions({ _experiments: { enableStandaloneAppStartTracing: true } }),
    );

    expect(integrations.some(i => i.name === 'StandaloneAppStart')).toBe(true);
  });

  it('does not include the StandaloneAppStart marker when the experiment flag is off', () => {
    const integrations = getDefaultIntegrations(createOptions({}));

    expect(integrations.some(i => i.name === 'StandaloneAppStart')).toBe(false);
  });

  it.each([
    ['tracing disabled', { tracesSampleRate: undefined }],
    ['app start tracking off', { enableAppStartTracking: false }],
    ['native off', { enableNative: false }],
  ])('includes the StandaloneAppStart marker when the flag is on and %s', (_label, overrides) => {
    const integrations = getDefaultIntegrations(
      createOptions({ ...overrides, _experiments: { enableStandaloneAppStartTracing: true } }),
    );

    expect(integrations.some(i => i.name === 'StandaloneAppStart')).toBe(true);
  });
});
