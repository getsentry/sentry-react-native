import * as RN from 'react-native';

import { ReactNativeClient } from '../src/js/client';
import { ReactNativeClientOptions, ReactNativeOptions } from '../src/js/options';
import { NativeTransport } from '../src/js/transports/native';
import { NATIVE } from '../src/js/wrapper';

const EXAMPLE_DSN =
  'https://6890c2f6677340daa4804f8194804ea2@o19635.ingest.sentry.io/148053';

interface MockedReactNative {
  NativeModules: {
    RNSentry: {
      initNativeSdk: jest.Mock;
      crash: jest.Mock;
      captureEnvelope: jest.Mock;
    };
  };
  Platform: {
    OS: 'mock';
  };
  LogBox: undefined;
  YellowBox: {
    ignoreWarnings: jest.Mock;
  };
}

jest.mock(
  'react-native',
  (): MockedReactNative => ({
    NativeModules: {
      RNSentry: {
        initNativeSdk: jest.fn(() => Promise.resolve(true)),
        crash: jest.fn(),
        captureEnvelope: jest.fn(),
      },
    },
    Platform: {
      OS: 'mock',
    },
    LogBox: undefined,
    YellowBox: {
      ignoreWarnings: jest.fn(),
    },
  }),
  /* virtual allows us to mock modules that aren't in package.json */
  { virtual: true }
);

const DEFAULT_OPTIONS: ReactNativeOptions = {
  enableNative: true,
  enableNativeCrashHandling: true,
  enableNativeNagger: true,
  autoInitializeNativeSdk: true,
  enableAutoPerformanceTracking: true,
  enableOutOfMemoryTracking: true,
  patchGlobalPromise: true
};

afterEach(() => {
  jest.clearAllMocks();
  NATIVE.enableNative = true;
});

describe('Tests ReactNativeClient', () => {
  describe('initializing the client', () => {
    test('falls back to YellowBox if no LogBox', async () => {
      const client = new ReactNativeClient({
        ...DEFAULT_OPTIONS,
        dsn: EXAMPLE_DSN,
        transport: () => new NativeTransport()
      } as ReactNativeClientOptions);

      await expect(client.eventFromMessage('test')).resolves.toBeDefined();
      // eslint-disable-next-line deprecation/deprecation
      await expect(RN.YellowBox.ignoreWarnings).toBeCalled();
    });
  });
});
