import { Envelope, Outcome, Transport } from '@sentry/types';
import { rejectedSyncPromise, SentryError } from '@sentry/utils';
import * as RN from 'react-native';

import { ReactNativeClient } from '../src/js/client';
import { ReactNativeClientOptions, ReactNativeOptions } from '../src/js/options';
import { NativeTransport } from '../src/js/transports/native';
import { SDK_NAME, SDK_VERSION } from '../src/js/version';
import { NATIVE } from '../src/js/wrapper';
import {
  envelopeHeader,
  envelopeItemHeader,
  envelopeItemPayload,
  envelopeItems,
  firstArg,
  getMockSession,
  getMockUserFeedback,
  getSyncPromiseRejectOnFirstCall,
} from './testutils';

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
  LogBox: {
    ignoreLogs: jest.Mock;
  } | undefined;
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
    LogBox: {
      ignoreLogs: jest.fn(),
    },
    YellowBox: {
      ignoreWarnings: jest.fn(),
    },
  }),
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
      await expect(RN.LogBox?.ignoreLogs).toBeCalled();
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

    test.skip('falls back to YellowBox if no LogBox', async () => {
      // @ts-ignore RN is mocked
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

    test('use custom transport function', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const mySend = (request: Envelope) => Promise.resolve();
      const myFlush = (timeout?: number) => Promise.resolve(Boolean(timeout));
      const myCustomTransportFn = (): Transport => ({
        send: mySend,
        flush: myFlush
      });
      const client = new ReactNativeClient({
        ...DEFAULT_OPTIONS,
        dsn: EXAMPLE_DSN,
        transport: myCustomTransportFn
      } as ReactNativeClientOptions);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(client.getTransport()?.flush).toBe(myFlush);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(client.getTransport()?.send).toBe(mySend);
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
      const RN: MockedReactNative = require('react-native');

      RN.NativeModules.RNSentry.initNativeSdk = jest.fn(() => {
        throw new Error();
      });

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
      // const RN: MockedReactNative = require('react-native');

      const client = new ReactNativeClient({
        ...DEFAULT_OPTIONS,
        enableNative: true,
        transport: () => new NativeTransport()

      } as ReactNativeClientOptions);
      client.nativeCrash();

      expect(RN.NativeModules.RNSentry.crash).toBeCalled();
    });
  });

  describe('UserFeedback', () => {
    test('sends UserFeedback to native Layer', () => {
      const mockTransportSend: jest.Mock = jest.fn(() => Promise.resolve());
      const client = new ReactNativeClient({
        ...DEFAULT_OPTIONS,
        dsn: EXAMPLE_DSN,
        transport: () => ({
          send: mockTransportSend,
          flush: jest.fn(),
        }),
      } as ReactNativeClientOptions);

      client.captureUserFeedback({
        comments: 'Test Comments',
        email: 'test@email.com',
        name: 'Test User',
        event_id: 'testEvent123',
      });

      expect(mockTransportSend.mock.calls[0][firstArg][envelopeHeader].event_id).toEqual('testEvent123');
      expect(mockTransportSend.mock.calls[0][firstArg][envelopeItems][0][envelopeItemHeader].type).toEqual(
        'user_report'
      );
      expect(mockTransportSend.mock.calls[0][firstArg][envelopeItems][0][envelopeItemPayload]).toEqual({
        comments: 'Test Comments',
        email: 'test@email.com',
        name: 'Test User',
        event_id: 'testEvent123',
      });
    });
  });

  describe('envelopeHeader SdkInfo', () => {
    let mockTransportSend: jest.Mock;
    let client: ReactNativeClient;

    beforeEach(() => {
      mockTransportSend = jest.fn(() => Promise.resolve());
      client = new ReactNativeClient({
        ...DEFAULT_OPTIONS,
        dsn: EXAMPLE_DSN,
        transport: () => ({
          send: mockTransportSend,
          flush: jest.fn(),
        }),
      } as ReactNativeClientOptions);
    });

    afterEach(() => {
      mockTransportSend.mockClear();
    });

    const expectedSdkInfo = { name: SDK_NAME, version: SDK_VERSION };
    const getSdkInfoFrom = (func: jest.Mock) =>
      func.mock.calls[0][firstArg][envelopeHeader].sdk;

    test('send SdkInfo in the message envelope header', () => {
      client.captureMessage('message_test_value');
      expect(getSdkInfoFrom(mockTransportSend)).toStrictEqual(expectedSdkInfo);
    });

    test('send SdkInfo in the exception envelope header', () => {
      client.captureException(new Error());
      expect(getSdkInfoFrom(mockTransportSend)).toStrictEqual(expectedSdkInfo);
    });

    test('send SdkInfo in the event envelope header', () => {
      client.captureEvent({});
      expect(getSdkInfoFrom(mockTransportSend)).toStrictEqual(expectedSdkInfo);
    });

    test('send SdkInfo in the session envelope header', () => {
      client.captureSession(getMockSession());
      expect(getSdkInfoFrom(mockTransportSend)).toStrictEqual(expectedSdkInfo);
    });

    test('send SdkInfo in the user feedback envelope header', () => {
      client.captureUserFeedback(getMockUserFeedback());
      expect(getSdkInfoFrom(mockTransportSend)).toStrictEqual(expectedSdkInfo);
    });
  });

  describe('clientReports', () => {
    test('does not send client reports if disabled', () => {
      const mockTransportSend = jest.fn((_envelope: Envelope) => Promise.resolve());
      const client = new ReactNativeClient({
        ...DEFAULT_OPTIONS,
        dsn: EXAMPLE_DSN,
        transport: () => ({
          send: mockTransportSend,
          flush: jest.fn(),
        }),
        sendClientReports: false,
      } as ReactNativeClientOptions);

      mockDroppedEvent(client);

      client.captureMessage('message_test_value');

      expectOnlyMessageEventInEnvelope(mockTransportSend);
    });

    test('send client reports on event envelope', () => {
      const mockTransportSend = jest.fn((_envelope: Envelope) => Promise.resolve());
      const client = new ReactNativeClient({
        ...DEFAULT_OPTIONS,
        dsn: EXAMPLE_DSN,
        transport: () => ({
          send: mockTransportSend,
          flush: jest.fn(),
        }),
        sendClientReports: true,
      } as ReactNativeClientOptions);

      mockDroppedEvent(client);

      client.captureMessage('message_test_value');

      expect(mockTransportSend).toBeCalledTimes(1);
      expect(mockTransportSend.mock.calls[0][firstArg][envelopeItems][1][envelopeItemHeader]).toEqual(
        { type: 'client_report' }
      );
      expect(mockTransportSend.mock.calls[0][firstArg][envelopeItems][1][envelopeItemPayload]).toEqual(
        expect.objectContaining({
          discarded_events: [
            {
              reason: 'before_send',
              category: 'error',
              quantity: 1,
            }
          ],
        }),
      );
      expect((client as unknown as { _outcomesBuffer: Outcome[] })._outcomesBuffer).toEqual(<Outcome[]>[]);
    });

    test('does not send empty client report', () => {
      const mockTransportSend = jest.fn((_envelope: Envelope) => Promise.resolve());
      const client = new ReactNativeClient({
        ...DEFAULT_OPTIONS,
        dsn: EXAMPLE_DSN,
        transport: () => ({
          send: mockTransportSend,
          flush: jest.fn(),
        }),
        sendClientReports: true,
      } as ReactNativeClientOptions);

      client.captureMessage('message_test_value');

      expectOnlyMessageEventInEnvelope(mockTransportSend);
    });

    test('keeps outcomes in case envelope fails to send', () => {
      const mockTransportSend = jest.fn((_envelope: Envelope) =>
        rejectedSyncPromise(new SentryError('Test')));
      const client = new ReactNativeClient({
        ...DEFAULT_OPTIONS,
        dsn: EXAMPLE_DSN,
        transport: () => ({
          send: mockTransportSend,
          flush: jest.fn(),
        }),
        sendClientReports: true,
      } as ReactNativeClientOptions);

      mockDroppedEvent(client);

      client.captureMessage('message_test_value');

      expect((client as unknown as { _outcomesBuffer: Outcome[] })._outcomesBuffer).toEqual(<Outcome[]>[
        { reason: 'before_send', category: 'error', quantity: 1 },
      ]);
    });

    test('sends buffered client reports on second try', () => {
      const mockTransportSend = getSyncPromiseRejectOnFirstCall<[Envelope]>(new SentryError('Test'));
      const client = new ReactNativeClient({
        ...DEFAULT_OPTIONS,
        dsn: EXAMPLE_DSN,
        transport: () => ({
          send: mockTransportSend,
          flush: jest.fn(),
        }),
        sendClientReports: true,
      } as ReactNativeClientOptions);

      mockDroppedEvent(client);
      client.captureMessage('message_test_value_1');
      mockDroppedEvent(client);
      client.captureMessage('message_test_value_2');

      expect(mockTransportSend).toBeCalledTimes(2);
      expect(mockTransportSend.mock.calls[0][firstArg][envelopeItems].length).toEqual(2);
      expect(mockTransportSend.mock.calls[0][firstArg][envelopeItems][1][envelopeItemHeader]).toEqual(
        { type: 'client_report' }
      );
      expect(mockTransportSend.mock.calls[0][firstArg][envelopeItems][1][envelopeItemPayload]).toEqual(
        expect.objectContaining({
          discarded_events: [
            {
              reason: 'before_send',
              category: 'error',
              quantity: 2,
            },
          ],
        }),
      );
      expect((client as unknown as { _outcomesBuffer: Outcome[] })._outcomesBuffer).toEqual(<Outcome[]>[]);
    });

    function expectOnlyMessageEventInEnvelope(transportSend: jest.Mock) {
      expect(transportSend).toBeCalledTimes(1);
      expect(transportSend.mock.calls[0][firstArg][envelopeItems]).toHaveLength(1);
      expect(transportSend.mock.calls[0][firstArg][envelopeItems][0][envelopeItemHeader]).toEqual(
        expect.objectContaining({ type: 'event' }),
      );
    }

    function mockDroppedEvent(
      client: ReactNativeClient,
    ) {
      client.recordDroppedEvent('before_send', 'error');
    }
  });
});
