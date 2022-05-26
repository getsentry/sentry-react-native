import * as RN from 'react-native';
import { ReactNativeClientOptions, ReactNativeOptions } from 'src/js/options';

import { ReactNativeClient } from '../src/js/client';
import { NATIVE } from '../src/js/wrapper';
import { NativeTransport } from '../src/js/transports/native';

const EXAMPLE_DSN =
  'https://6890c2f6677340daa4804f8194804ea2@o19635.ingest.sentry.io/148053';

jest.mock(
  'react-native',
  () => ({
    NativeModules: {
      RNSentry: {
        initNativeSdk: jest.fn(() => Promise.resolve(true)),
        crash: jest.fn(),
      },
    },
    Platform: {
      OS: 'mock',
    },
    LogBox: {
      ignoreLogs: jest.fn(),
    },
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
    test('client initializes', async () => {
      const client = new ReactNativeClient({
        ...DEFAULT_OPTIONS,
        dsn: EXAMPLE_DSN,
        transport: () => new NativeTransport()
      } as ReactNativeClientOptions);

      await expect(client.eventFromMessage('test')).resolves.toBeDefined();
      // @ts-ignore: Is Mocked
      // eslint-disable-next-line @typescript-eslint/unbound-method
      await expect(RN.LogBox.ignoreLogs).toBeCalled();
    });

    test('invalid dsn is thrown', () => {
      try {
        new ReactNativeClient({
          ...DEFAULT_OPTIONS,
          dsn: 'not a dsn',
          transport: () => new NativeTransport()
        } as ReactNativeClientOptions);
      } catch (e: any) {
        expect(e.message).toBe('Invalid Sentry Dsn: not a dsn');
      }
    });

    test("undefined dsn doesn't crash", () => {
      expect(() => {
        const backend = new ReactNativeClient({
          ...DEFAULT_OPTIONS,
          dsn: undefined,
          transport: () => new NativeTransport()
        } as ReactNativeClientOptions);

        return expect(backend.eventFromMessage('test')).resolves.toBeDefined();
      }).not.toThrow();
    });

    test('falls back to YellowBox if no LogBox', async () => {
      // @ts-ignore: Is Mocked
      RN.LogBox = undefined;

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

  describe('onReady', () => {
    test('calls onReady callback with true if Native SDK is initialized', (done) => {
      new ReactNativeClient({
        dsn: EXAMPLE_DSN,
        enableNative: true,
        onReady: ({ didCallNativeInit }) => {
          expect(didCallNativeInit).toBe(true);

          done();
        },
        transport: () => new NativeTransport()
      } as ReactNativeOptions as ReactNativeClientOptions);
    });

    test('calls onReady callback with false if Native SDK was not initialized', (done) => {
      new ReactNativeClient({
        dsn: EXAMPLE_DSN,
        enableNative: false,
        onReady: ({ didCallNativeInit }) => {
          expect(didCallNativeInit).toBe(false);

          done();
        },
        transport: () => new NativeTransport()
      } as ReactNativeOptions as ReactNativeClientOptions);
    });

    test('calls onReady callback with false if Native SDK failed to initialize', (done) => {
      const RN = require('react-native');

      RN.NativeModules.RNSentry.initNativeSdk = async () => {
        throw new Error();
      };

      new ReactNativeClient({
        dsn: EXAMPLE_DSN,
        enableNative: true,
        onReady: ({ didCallNativeInit }) => {
          expect(didCallNativeInit).toBe(false);

          done();
        },
        transport: () => new NativeTransport()
      } as ReactNativeOptions as ReactNativeClientOptions);
    });
  });

  describe('nativeCrash', () => {
    test('calls NativeModules crash', () => {
      const RN = require('react-native');

      const client = new ReactNativeClient({
        ...DEFAULT_OPTIONS,
        enableNative: true,
        transport: () => new NativeTransport()

      } as ReactNativeClientOptions);
      client.nativeCrash();

      expect(RN.NativeModules.RNSentry.crash).toBeCalled();
    });
  });
});
