import type { Client } from '@sentry/core';

import { nativeReleaseIntegration } from '../../src/js/integrations/release';

jest.mock('../../src/js/wrapper', () => ({
  NATIVE: {
    fetchNativeRelease: jest.fn(),
  },
}));

jest.mock('../../src/js/utils/environment', () => ({
  isExpo: jest.fn(),
  isWeb: jest.fn(),
}));

import { isExpo, isWeb } from '../../src/js/utils/environment';
import { NATIVE } from '../../src/js/wrapper';

const mockIsExpo = isExpo as jest.MockedFunction<typeof isExpo>;
const mockIsWeb = isWeb as jest.MockedFunction<typeof isWeb>;
const mockFetchNativeRelease = NATIVE.fetchNativeRelease as jest.MockedFunction<typeof NATIVE.fetchNativeRelease>;

describe('Tests the Release integration', () => {
  beforeEach(() => {
    mockIsExpo.mockReturnValue(false);
    mockIsWeb.mockReturnValue(false);

    mockFetchNativeRelease.mockResolvedValue({
      build: 'native_build',
      id: 'native_id',
      version: 'native_version',
    });

    delete (globalThis as any).process;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('Uses release from native SDK if release/dist are not present in options.', async () => {
    const releaseIntegration = nativeReleaseIntegration();

    const event = await releaseIntegration.processEvent!({}, {}, { getOptions: () => ({}) } as Client);

    expect(event?.release).toBe('native_id@native_version+native_build');
    expect(event?.dist).toBe('native_build');
  });

  test('Uses release from native SDK if release is not present in options.', async () => {
    const releaseIntegration = nativeReleaseIntegration();

    const event = await releaseIntegration.processEvent!({}, {}, {
      getOptions: () => ({ dist: 'options_dist' }),
    } as Client);

    expect(event?.release).toBe('native_id@native_version+native_build');
    expect(event?.dist).toBe('options_dist');
  });

  test('Uses dist from native SDK if dist is not present in options.', async () => {
    const releaseIntegration = nativeReleaseIntegration();

    const event = await releaseIntegration.processEvent!({}, {}, {
      getOptions: () => ({ release: 'options_release' }),
    } as Client);

    expect(event?.release).toBe('options_release');
    expect(event?.dist).toBe('native_build');
  });

  test('Uses release and dist from options', async () => {
    const releaseIntegration = nativeReleaseIntegration();

    const event = await releaseIntegration.processEvent!({}, {}, {
      getOptions: () => ({ dist: 'options_dist', release: 'options_release' }),
    } as Client);

    expect(event?.release).toBe('options_release');
    expect(event?.dist).toBe('options_dist');
  });

  test('Uses __sentry_release and __sentry_dist over everything else.', async () => {
    const releaseIntegration = nativeReleaseIntegration();

    const event = await releaseIntegration.processEvent!(
      {
        extra: {
          __sentry_dist: 'sentry_dist',
          __sentry_release: 'sentry_release',
        },
      },
      {},
      {
        getOptions: () => ({
          dist: 'options_dist',
          release: 'options_release',
        }),
      } as Client,
    );

    expect(event?.release).toBe('sentry_release');
    expect(event?.dist).toBe('sentry_dist');
  });

  describe('Expo Web Config Tests', () => {
    beforeEach(() => {
      // Mock native release to throw error so it falls back to Expo Web
      mockFetchNativeRelease.mockRejectedValue(new Error('Native release failed'));
    });

    test('Uses Expo Web config when isExpo and isWeb are true and environment variables are set', async () => {
      mockIsExpo.mockReturnValue(true);
      mockIsWeb.mockReturnValue(true);

      (globalThis as any).process = {
        env: {
          EXPO_PUBLIC_APP_NAME: 'MyExpoApp',
          EXPO_PUBLIC_APP_VERSION: '1.2.3',
        },
      };

      const releaseIntegration = nativeReleaseIntegration();
      const event = await releaseIntegration.processEvent!({}, {}, { getOptions: () => ({}) } as Client);

      expect(event?.release).toBe('MyExpoApp@1.2.3');
    });

    test('Does not use Expo Web config when not in Expo environment', async () => {
      mockIsExpo.mockReturnValue(false);
      mockIsWeb.mockReturnValue(true);

      (globalThis as any).process = {
        env: {
          EXPO_PUBLIC_APP_NAME: 'MyExpoApp',
          EXPO_PUBLIC_APP_VERSION: '1.2.3',
        },
      };

      const releaseIntegration = nativeReleaseIntegration();
      const event = await releaseIntegration.processEvent!({}, {}, { getOptions: () => ({}) } as Client);

      expect(event?.release).toBeUndefined();
    });

    test('Does not use Expo Web config when not in web environment', async () => {
      mockIsExpo.mockReturnValue(true);
      mockIsWeb.mockReturnValue(false);

      (globalThis as any).process = {
        env: {
          EXPO_PUBLIC_APP_NAME: 'MyExpoApp',
          EXPO_PUBLIC_APP_VERSION: '1.2.3',
        },
      };

      const releaseIntegration = nativeReleaseIntegration();
      const event = await releaseIntegration.processEvent!({}, {}, { getOptions: () => ({}) } as Client);

      expect(event?.release).toBeUndefined();
    });

    test('Does not use Expo Web config when app name is missing', async () => {
      mockIsExpo.mockReturnValue(true);
      mockIsWeb.mockReturnValue(true);

      (globalThis as any).process = {
        env: {
          EXPO_PUBLIC_APP_VERSION: '1.2.3',
        },
      };

      const releaseIntegration = nativeReleaseIntegration();
      const event = await releaseIntegration.processEvent!({}, {}, { getOptions: () => ({}) } as Client);

      expect(event?.release).toBeUndefined();
    });

    test('Does not use Expo Web config when app version is missing', async () => {
      mockIsExpo.mockReturnValue(true);
      mockIsWeb.mockReturnValue(true);

      (globalThis as any).process = {
        env: {
          EXPO_PUBLIC_APP_NAME: 'MyExpoApp',
        },
      };

      const releaseIntegration = nativeReleaseIntegration();
      const event = await releaseIntegration.processEvent!({}, {}, { getOptions: () => ({}) } as Client);

      expect(event?.release).toBeUndefined();
    });

    test('Does not use Expo Web config when process.env is not available', async () => {
      mockIsExpo.mockReturnValue(true);
      mockIsWeb.mockReturnValue(true);

      delete (globalThis as any).process;

      const releaseIntegration = nativeReleaseIntegration();
      const event = await releaseIntegration.processEvent!({}, {}, { getOptions: () => ({}) } as Client);

      expect(event?.release).toBeUndefined();
    });

    test('Prefers options release over Expo Web config', async () => {
      mockIsExpo.mockReturnValue(true);
      mockIsWeb.mockReturnValue(true);

      (globalThis as any).process = {
        env: {
          EXPO_PUBLIC_APP_NAME: 'MyExpoApp',
          EXPO_PUBLIC_APP_VERSION: '1.2.3',
        },
      };

      const releaseIntegration = nativeReleaseIntegration();
      const event = await releaseIntegration.processEvent!({}, {}, {
        getOptions: () => ({ release: 'options_release' }),
      } as Client);

      expect(event?.release).toBe('options_release');
    });

    test('Prefers __sentry_release over Expo Web config', async () => {
      mockIsExpo.mockReturnValue(true);
      mockIsWeb.mockReturnValue(true);

      (globalThis as any).process = {
        env: {
          EXPO_PUBLIC_APP_NAME: 'MyExpoApp',
          EXPO_PUBLIC_APP_VERSION: '1.2.3',
        },
      };

      const releaseIntegration = nativeReleaseIntegration();
      const event = await releaseIntegration.processEvent!(
        {
          extra: {
            __sentry_release: 'sentry_release',
          },
        },
        {},
        { getOptions: () => ({}) } as Client,
      );

      expect(event?.release).toBe('sentry_release');
    });
  });
});
