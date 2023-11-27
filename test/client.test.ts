import { defaultStackParser } from '@sentry/browser';
import type { Envelope, Event, Outcome, Transport } from '@sentry/types';
import { rejectedSyncPromise, SentryError } from '@sentry/utils';
import * as RN from 'react-native';

import { ReactNativeClient } from '../src/js/client';
import type { ReactNativeClientOptions } from '../src/js/options';
import type { RoutingInstrumentationInstance } from '../src/js/tracing';
import { ReactNativeTracing } from '../src/js/tracing';
import { NativeTransport } from '../src/js/transports/native';
import { SDK_NAME, SDK_PACKAGE_NAME, SDK_VERSION } from '../src/js/version';
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

interface MockedReactNative {
  NativeModules: {
    RNSentry: {
      initNativeSdk: jest.Mock;
      crash: jest.Mock;
      captureEnvelope: jest.Mock;
      captureScreenshot: jest.Mock;
      fetchNativeAppStart: jest.Mock;
      enableNativeFramesTracking: jest.Mock;
    };
  };
  Platform: {
    OS: 'mock';
  };
  LogBox: {
    ignoreLogs: jest.Mock;
  };
  YellowBox: {
    ignoreWarnings: jest.Mock;
  };
  Alert: {
    alert: jest.Mock;
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
        captureScreenshot: jest.fn().mockResolvedValue(null),
        fetchNativeAppStart: jest.fn(),
        enableNativeFramesTracking: jest.fn(),
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
    Alert: {
      alert: jest.fn(),
    },
  }),
);

const EXAMPLE_DSN = 'https://6890c2f6677340daa4804f8194804ea2@o19635.ingest.sentry.io/148053';

const DEFAULT_OPTIONS: ReactNativeClientOptions = {
  enableNative: true,
  enableNativeCrashHandling: true,
  enableNativeNagger: true,
  autoInitializeNativeSdk: true,
  enableAutoPerformanceTracing: true,
  enableWatchdogTerminationTracking: true,
  patchGlobalPromise: true,
  integrations: [],
  transport: () => ({
    send: jest.fn(),
    flush: jest.fn(),
  }),
  stackParser: jest.fn().mockReturnValue([]),
};

describe('Tests ReactNativeClient', () => {
  describe('initializing the client', () => {
    test('client initializes', async () => {
      const client = new ReactNativeClient({
        ...DEFAULT_OPTIONS,
        dsn: EXAMPLE_DSN,
        transport: () => new NativeTransport(),
      });

      await expect(client.eventFromMessage('test')).resolves.toBeDefined();
      // @ts-expect-error: Is Mocked
      await expect(RN.LogBox.ignoreLogs).toBeCalled();
    });

    test('invalid dsn is thrown', () => {
      try {
        new ReactNativeClient({
          ...DEFAULT_OPTIONS,
          dsn: 'not a dsn',
          transport: () => new NativeTransport(),
        });
      } catch (e: any) {
        expect(e.message).toBe('Invalid Sentry Dsn: not a dsn');
      }
    });

    test("undefined dsn doesn't crash", () => {
      expect(() => {
        const backend = new ReactNativeClient({
          ...DEFAULT_OPTIONS,
          dsn: undefined,
          transport: () => new NativeTransport(),
        });

        return expect(backend.eventFromMessage('test')).resolves.toBeDefined();
      }).not.toThrow();
    });

    test('use custom transport function', async () => {
      const mySend = (_request: Envelope) => Promise.resolve();
      const myFlush = (timeout?: number) => Promise.resolve(Boolean(timeout));
      const myCustomTransportFn = (): Transport => ({
        send: mySend,
        flush: myFlush,
      });
      const client = new ReactNativeClient({
        ...DEFAULT_OPTIONS,
        dsn: EXAMPLE_DSN,
        transport: myCustomTransportFn,
      });
      expect(client.getTransport()?.flush).toBe(myFlush);
      expect(client.getTransport()?.send).toBe(mySend);
    });
  });

  describe('onReady', () => {
    test('calls onReady callback with true if Native SDK is initialized', done => {
      new ReactNativeClient(
        mockedOptions({
          dsn: EXAMPLE_DSN,
          enableNative: true,
          onReady: ({ didCallNativeInit }) => {
            expect(didCallNativeInit).toBe(true);

            done();
          },
          transport: () => new NativeTransport(),
        }),
      );
    });

    test('calls onReady callback with false if Native SDK was not initialized', done => {
      new ReactNativeClient(
        mockedOptions({
          dsn: EXAMPLE_DSN,
          enableNative: false,
          onReady: ({ didCallNativeInit }) => {
            expect(didCallNativeInit).toBe(false);

            done();
          },
          transport: () => new NativeTransport(),
        }),
      );
    });

    test('calls onReady callback with false if Native SDK failed to initialize', done => {
      const RN: MockedReactNative = require('react-native');

      RN.NativeModules.RNSentry.initNativeSdk = jest.fn(() => {
        throw new Error();
      });

      new ReactNativeClient(
        mockedOptions({
          dsn: EXAMPLE_DSN,
          enableNative: true,
          onReady: ({ didCallNativeInit }) => {
            expect(didCallNativeInit).toBe(false);

            done();
          },
          transport: () => new NativeTransport(),
        }),
      );
    });
  });

  describe('nativeCrash', () => {
    test('calls NativeModules crash', () => {
      NATIVE.enableNative = true;
      const RN: MockedReactNative = require('react-native');

      const client = new ReactNativeClient({
        ...DEFAULT_OPTIONS,
        dsn: EXAMPLE_DSN,
        enableNative: true,
        transport: () => new NativeTransport(),
      });
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
      });

      client.captureUserFeedback({
        comments: 'Test Comments',
        email: 'test@email.com',
        name: 'Test User',
        event_id: 'testEvent123',
      });

      expect(mockTransportSend.mock.calls[0][firstArg][envelopeHeader].event_id).toEqual('testEvent123');
      expect(mockTransportSend.mock.calls[0][firstArg][envelopeItems][0][envelopeItemHeader].type).toEqual(
        'user_report',
      );
      expect(mockTransportSend.mock.calls[0][firstArg][envelopeItems][0][envelopeItemPayload]).toEqual({
        comments: 'Test Comments',
        email: 'test@email.com',
        name: 'Test User',
        event_id: 'testEvent123',
      });
    });
  });

  describe('attachStacktrace', () => {
    let mockTransportSend: jest.Mock;
    let client: ReactNativeClient;

    beforeEach(() => {
      mockTransportSend = jest.fn(() => Promise.resolve());
      client = new ReactNativeClient({
        ...DEFAULT_OPTIONS,
        attachStacktrace: true,
        stackParser: defaultStackParser,
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

    const getMessageEventFrom = (func: jest.Mock) =>
      func.mock.calls[0][firstArg][envelopeItems][0][envelopeItemPayload];

    test('captureMessage contains stack trace in threads', async () => {
      const mockSyntheticExceptionFromHub = new Error();
      client.captureMessage('test message', 'error', { syntheticException: mockSyntheticExceptionFromHub });
      expect(getMessageEventFrom(mockTransportSend).threads.values.length).toBeGreaterThan(0);
      expect(getMessageEventFrom(mockTransportSend).exception).toBeUndefined();
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
      });
    });

    afterEach(() => {
      mockTransportSend.mockClear();
    });

    const expectedSdkInfo = { name: SDK_NAME, version: SDK_VERSION };
    const getSdkInfoFrom = (func: jest.Mock) => func.mock.calls[0][firstArg][envelopeHeader].sdk;

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

  describe('event data enhancement', () => {
    test('event contains sdk default information', async () => {
      const mockedSend = jest.fn<PromiseLike<void>, [Envelope]>().mockResolvedValue(undefined);
      const mockedTransport = (): Transport => ({
        send: mockedSend,
        flush: jest.fn().mockResolvedValue(true),
      });
      const client = new ReactNativeClient({
        ...DEFAULT_OPTIONS,
        dsn: EXAMPLE_DSN,
        transport: mockedTransport,
      });

      client.captureEvent({ message: 'test event' });

      expect(mockedSend).toBeCalled();
      const actualEvent: Event | undefined = <Event>(
        mockedSend.mock.calls[0][firstArg][envelopeItems][0][envelopeItemPayload]
      );
      expect(actualEvent?.sdk?.packages).toEqual([
        {
          name: SDK_PACKAGE_NAME,
          version: SDK_VERSION,
        },
      ]);
    });
  });

  describe('normalizes events', () => {
    test('handles circular input', async () => {
      const mockedSend = jest.fn<PromiseLike<void>, [Envelope]>();
      const mockedTransport = (): Transport => ({
        send: mockedSend,
        flush: jest.fn().mockResolvedValue(true),
      });
      const client = new ReactNativeClient({
        ...DEFAULT_OPTIONS,
        dsn: EXAMPLE_DSN,
        transport: mockedTransport,
      });
      const circularEvent = {
        extra: {
          circular: {},
        },
      };
      circularEvent.extra.circular = circularEvent;

      client.captureEvent(circularEvent);

      expect(mockedSend).toBeCalled();
      const actualEvent: Event | undefined = <Event>(
        mockedSend.mock.calls[0][firstArg][envelopeItems][0][envelopeItemPayload]
      );
      expect(actualEvent?.extra).toEqual({
        circular: {
          extra: '[Circular ~]',
        },
      });
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
      });

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
      });

      mockDroppedEvent(client);

      client.captureMessage('message_test_value');

      expect(mockTransportSend).toBeCalledTimes(1);
      expect(mockTransportSend.mock.calls[0][firstArg][envelopeItems][1][envelopeItemHeader]).toEqual({
        type: 'client_report',
      });
      expect(mockTransportSend.mock.calls[0][firstArg][envelopeItems][1][envelopeItemPayload]).toEqual(
        expect.objectContaining({
          discarded_events: [
            {
              reason: 'before_send',
              category: 'error',
              quantity: 1,
            },
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
      });

      client.captureMessage('message_test_value');

      expectOnlyMessageEventInEnvelope(mockTransportSend);
    });

    test('keeps outcomes in case envelope fails to send', () => {
      const mockTransportSend = jest.fn((_envelope: Envelope) => rejectedSyncPromise(new SentryError('Test')));
      const client = new ReactNativeClient({
        ...DEFAULT_OPTIONS,
        dsn: EXAMPLE_DSN,
        transport: () => ({
          send: mockTransportSend,
          flush: jest.fn(),
        }),
        sendClientReports: true,
      });

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
      });

      mockDroppedEvent(client);
      client.captureMessage('message_test_value_1');
      mockDroppedEvent(client);
      client.captureMessage('message_test_value_2');

      expect(mockTransportSend).toBeCalledTimes(2);
      expect(mockTransportSend.mock.calls[0][firstArg][envelopeItems].length).toEqual(2);
      expect(mockTransportSend.mock.calls[0][firstArg][envelopeItems][1][envelopeItemHeader]).toEqual({
        type: 'client_report',
      });
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

    function mockDroppedEvent(client: ReactNativeClient) {
      client.recordDroppedEvent('before_send', 'error');
    }
  });

  describe('register enabled instrumentation as integrations', () => {
    test('register routing instrumentation', () => {
      const mockRoutingInstrumentation: RoutingInstrumentationInstance = {
        registerRoutingInstrumentation: jest.fn(),
        onRouteWillChange: jest.fn(),
        name: 'MockRoutingInstrumentation',
      };
      const client = new ReactNativeClient(
        mockedOptions({
          dsn: EXAMPLE_DSN,
          integrations: [
            new ReactNativeTracing({
              routingInstrumentation: mockRoutingInstrumentation,
            }),
          ],
        }),
      );
      client.setupIntegrations();

      expect(client.getIntegrationById('MockRoutingInstrumentation')).toBeTruthy();
    });
  });

  describe('user interactions tracing as integrations', () => {
    test('register user interactions tracing', () => {
      const client = new ReactNativeClient(
        mockedOptions({
          dsn: EXAMPLE_DSN,
          integrations: [
            new ReactNativeTracing({
              enableUserInteractionTracing: true,
            }),
          ],
        }),
      );
      client.setupIntegrations();

      expect(client.getIntegrationById('ReactNativeUserInteractionTracing')).toBeTruthy();
    });

    test('do not register user interactions tracing', () => {
      const client = new ReactNativeClient(
        mockedOptions({
          dsn: EXAMPLE_DSN,
          integrations: [
            new ReactNativeTracing({
              enableUserInteractionTracing: false,
            }),
          ],
        }),
      );
      client.setupIntegrations();

      expect(client.getIntegrationById('ReactNativeUserInteractionTracing')).toBeUndefined();
    });
  });
});

function mockedOptions(options: Partial<ReactNativeClientOptions>): ReactNativeClientOptions {
  return {
    integrations: [],
    stackParser: jest.fn().mockReturnValue([]),
    transport: () => ({
      send: jest.fn(),
      flush: jest.fn(),
    }),
    ...options,
  };
}
