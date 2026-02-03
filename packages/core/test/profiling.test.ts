import type { Spec } from '../src/js/NativeRNSentry';
import type { ReactNativeClientOptions } from '../src/js/options';
import { NATIVE } from '../src/js/wrapper';

jest.mock('react-native', () => {
  let initPayload: ReactNativeClientOptions | null = null;

  const RNSentry: Spec = {
    addBreadcrumb: jest.fn(),
    captureEnvelope: jest.fn(),
    clearBreadcrumbs: jest.fn(),
    crashedLastRun: jest.fn(),
    crash: jest.fn(),
    fetchNativeDeviceContexts: jest.fn(() =>
      Promise.resolve({
        someContext: {
          someValue: 0,
        },
      }),
    ),
    fetchNativeRelease: jest.fn(() =>
      Promise.resolve({
        build: '1.0.0.1',
        id: 'test-mock',
        version: '1.0.0',
      }),
    ),
    setContext: jest.fn(),
    setExtra: jest.fn(),
    setTag: jest.fn(),
    setUser: jest.fn(() => {
      return;
    }),
    initNativeSdk: jest.fn(options => {
      initPayload = options;
      return Promise.resolve(true);
    }),
    closeNativeSdk: jest.fn(() => Promise.resolve()),
    // @ts-expect-error for testing.
    _getLastPayload: () => ({ initPayload }),
    startProfiling: jest.fn(),
    stopProfiling: jest.fn(),
  };

  return {
    NativeModules: {
      RNSentry,
    },
    Platform: {
      OS: 'android',
    },
  };
});

const RNSentry = require('react-native').NativeModules.RNSentry as Spec;

describe('UI Profiling Options', () => {
  beforeEach(() => {
    NATIVE.platform = 'android';
    NATIVE.enableNative = true;
    jest.clearAllMocks();
  });

  it('passes profilingOptions to native SDK', async () => {
    await NATIVE.initNativeSdk({
      dsn: 'https://example@sentry.io/123',
      enableNative: true,
      autoInitializeNativeSdk: true,
      devServerUrl: undefined,
      defaultSidecarUrl: undefined,
      mobileReplayOptions: undefined,
      profilingOptions: {
        profileSessionSampleRate: 0.5,
        lifecycle: 'trace',
        startOnAppStart: true,
      },
    });

    expect(RNSentry.initNativeSdk).toHaveBeenCalledWith(
      expect.objectContaining({
        _experiments: expect.objectContaining({
          profilingOptions: {
            profileSessionSampleRate: 0.5,
            lifecycle: 'trace',
            startOnAppStart: true,
          },
        }),
      }),
    );
  });

  it('passes profilingOptions with manual lifecycle', async () => {
    await NATIVE.initNativeSdk({
      dsn: 'https://example@sentry.io/123',
      enableNative: true,
      autoInitializeNativeSdk: true,
      devServerUrl: undefined,
      defaultSidecarUrl: undefined,
      mobileReplayOptions: undefined,
      profilingOptions: {
        profileSessionSampleRate: 1.0,
        lifecycle: 'manual',
        startOnAppStart: false,
      },
    });

    expect(RNSentry.initNativeSdk).toHaveBeenCalledWith(
      expect.objectContaining({
        _experiments: expect.objectContaining({
          profilingOptions: {
            profileSessionSampleRate: 1.0,
            lifecycle: 'manual',
            startOnAppStart: false,
          },
        }),
      }),
    );
  });

  it('does not pass profilingOptions when undefined', async () => {
    await NATIVE.initNativeSdk({
      dsn: 'https://example@sentry.io/123',
      enableNative: true,
      autoInitializeNativeSdk: true,
      devServerUrl: undefined,
      defaultSidecarUrl: undefined,
      mobileReplayOptions: undefined,
      profilingOptions: undefined,
    });

    const callArgs = (RNSentry.initNativeSdk as jest.Mock).mock.calls[0][0];
    expect(callArgs._experiments?.profilingOptions).toBeUndefined();
  });

  it('handles partial profilingOptions', async () => {
    await NATIVE.initNativeSdk({
      dsn: 'https://example@sentry.io/123',
      enableNative: true,
      autoInitializeNativeSdk: true,
      devServerUrl: undefined,
      defaultSidecarUrl: undefined,
      mobileReplayOptions: undefined,
      profilingOptions: {
        profileSessionSampleRate: 0.3,
        // lifecycle and startOnAppStart not provided
      },
    });

    expect(RNSentry.initNativeSdk).toHaveBeenCalledWith(
      expect.objectContaining({
        _experiments: expect.objectContaining({
          profilingOptions: {
            profileSessionSampleRate: 0.3,
          },
        }),
      }),
    );
  });
});
