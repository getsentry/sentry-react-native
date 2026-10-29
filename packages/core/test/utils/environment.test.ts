import { isExpoFetchEnabled, isResourceTimingSupported } from '../../src/js/utils/environment';
import { ReactNativeLibraries } from '../../src/js/utils/rnlibraries';
import { RN_GLOBAL_OBJ } from '../../src/js/utils/worldwide';

describe('isExpoFetchEnabled', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      delete (globalThis as Partial<typeof globalThis>).fetch;
    }
  });

  it('returns false when globalThis.fetch is undefined', () => {
    delete (globalThis as Partial<typeof globalThis>).fetch;
    expect(isExpoFetchEnabled()).toBe(false);
  });

  it('returns false when globalThis.fetch is a plain function without expo.builtin symbol', () => {
    globalThis.fetch = jest.fn() as unknown as typeof fetch;
    expect(isExpoFetchEnabled()).toBe(false);
  });

  it('returns true when globalThis.fetch has the expo.builtin symbol', () => {
    const expoFetch = jest.fn() as unknown as typeof fetch;
    Object.defineProperty(expoFetch, Symbol.for('expo.builtin'), {
      value: true,
      enumerable: false,
      configurable: false,
    });
    globalThis.fetch = expoFetch;
    expect(isExpoFetchEnabled()).toBe(true);
  });

  it('returns false when expo.builtin symbol is present but not true', () => {
    const expoFetch = jest.fn() as unknown as typeof fetch;
    Object.defineProperty(expoFetch, Symbol.for('expo.builtin'), {
      value: false,
      enumerable: false,
      configurable: false,
    });
    globalThis.fetch = expoFetch;
    expect(isExpoFetchEnabled()).toBe(false);
  });

  describe('with the Expo Router fetch wrapper', () => {
    const originalExpo = RN_GLOBAL_OBJ.expo;

    const mockRouterFetchWrapper = (): void => {
      const wrapper = jest.fn() as unknown as typeof fetch;
      Object.defineProperty(wrapper, Symbol.for('expo.polyfillFetchWithWindowLocation'), { value: true });
      globalThis.fetch = wrapper;
    };

    const mockExpoManifest = (manifest: unknown): void => {
      RN_GLOBAL_OBJ.expo = {
        modules: { ExponentConstants: { manifest } },
      } as typeof RN_GLOBAL_OBJ.expo;
    };

    const mockExpoSdkVersion = (sdkVersion: string | undefined): void => {
      mockExpoManifest({ sdkVersion });
    };

    afterEach(() => {
      RN_GLOBAL_OBJ.expo = originalExpo;
      delete process.env.EXPO_PUBLIC_USE_RN_FETCH;
    });

    it.each(['56.0.0', '57.0.0', '58.0.0'])('returns true on Expo SDK %s', sdkVersion => {
      mockRouterFetchWrapper();
      mockExpoSdkVersion(sdkVersion);

      expect(isExpoFetchEnabled()).toBe(true);
    });

    it('returns false on Expo SDK 55, which does not install expo/fetch', () => {
      mockRouterFetchWrapper();
      mockExpoSdkVersion('55.0.0');

      expect(isExpoFetchEnabled()).toBe(false);
    });

    it('reads the Expo SDK version from a JSON string manifest (Android)', () => {
      mockRouterFetchWrapper();
      mockExpoManifest(JSON.stringify({ sdkVersion: '57.0.0' }));

      expect(isExpoFetchEnabled()).toBe(true);
    });

    it('returns false when the manifest is not valid JSON', () => {
      mockRouterFetchWrapper();
      mockExpoManifest('{');

      expect(isExpoFetchEnabled()).toBe(false);
    });

    it('returns false when the Expo SDK version is unknown', () => {
      mockRouterFetchWrapper();
      mockExpoSdkVersion(undefined);

      expect(isExpoFetchEnabled()).toBe(false);
    });

    it.each(['1', 'true'])('returns false when EXPO_PUBLIC_USE_RN_FETCH is %s', value => {
      mockRouterFetchWrapper();
      mockExpoSdkVersion('57.0.0');
      process.env.EXPO_PUBLIC_USE_RN_FETCH = value;

      expect(isExpoFetchEnabled()).toBe(false);
    });

    it('returns true when EXPO_PUBLIC_USE_RN_FETCH is not an opt-in value', () => {
      mockRouterFetchWrapper();
      mockExpoSdkVersion('57.0.0');
      process.env.EXPO_PUBLIC_USE_RN_FETCH = '0';

      expect(isExpoFetchEnabled()).toBe(true);
    });
  });
});

describe('isResourceTimingSupported', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    [0, 83],
    [0, 87],
    [1, 0],
  ])('returns true on React Native %i.%i', (major, minor) => {
    jest.replaceProperty(ReactNativeLibraries, 'ReactNativeVersion', { version: { major, minor, patch: 0 } });

    expect(isResourceTimingSupported()).toBe(true);
  });

  it.each([
    [0, 80],
    [0, 81],
    [0, 82],
  ])('returns false on React Native %i.%i', (major, minor) => {
    jest.replaceProperty(ReactNativeLibraries, 'ReactNativeVersion', { version: { major, minor, patch: 0 } });

    expect(isResourceTimingSupported()).toBe(false);
  });

  it('returns false when the React Native version is unknown', () => {
    jest.replaceProperty(ReactNativeLibraries, 'ReactNativeVersion', { version: undefined });

    expect(isResourceTimingSupported()).toBe(false);
  });
});
