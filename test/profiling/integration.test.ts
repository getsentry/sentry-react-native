import * as mockWrapper from '../mockWrapper';
jest.mock('../../src/js/wrapper', () => mockWrapper);
jest.mock('../../src/js/utils/environment');

import { getCurrentHub } from '@sentry/core';
import type { Envelope, Event, Profile, Transaction, Transport } from '@sentry/types';

import * as Sentry from '../../src/js';
import { HermesProfiling } from '../../src/js/integrations';
import type { NativeDeviceContextsResponse } from '../../src/js/NativeRNSentry';
import type * as Hermes from '../../src/js/profiling/hermes';
import { getDefaultEnvironment, isHermesEnabled } from '../../src/js/utils/environment';
import { RN_GLOBAL_OBJ } from '../../src/js/utils/worldwide';
import { MOCK_DSN } from '../mockDsn';
import { envelopeItemPayload, envelopeItems } from '../testutils';

const SEC_TO_MS = 1e6;

describe('profiling integration', () => {
  let mock: {
    transportSendMock: jest.Mock<ReturnType<Transport['send']>, Parameters<Transport['send']>>;
  };

  beforeEach(() => {
    (isHermesEnabled as jest.Mock).mockReturnValue(true);
    mockWrapper.NATIVE.startProfiling.mockReturnValue(true);
    mockWrapper.NATIVE.stopProfiling.mockReturnValue(createMockMinimalValidHermesProfile());
    jest.useFakeTimers();
  });

  afterEach(async () => {
    jest.runAllTimers();
    jest.useRealTimers();
    RN_GLOBAL_OBJ.__SENTRY__.globalEventProcessors = []; // resets integrations
    await Sentry.close();
  });

  test('should start profile if there is a transaction running when integration is created', () => {
    mock = initTestClient({ withProfiling: false });
    jest.runAllTimers();
    jest.clearAllMocks();

    const transaction: Transaction = Sentry.startTransaction({
      name: 'test-name',
    });
    getCurrentHub().getScope()?.setSpan(transaction);

    getCurrentHub().getClient()?.addIntegration?.(new HermesProfiling());

    transaction.finish();
    jest.runAllTimers();

    const envelope: Envelope | undefined = mock.transportSendMock.mock.lastCall?.[0];
    const transactionEnvelopeItemPayload = envelope?.[envelopeItems][0][envelopeItemPayload] as Event;
    const profileEnvelopeItem = envelope?.[envelopeItems][1] as [{ type: 'profile' }, Profile];
    expect(profileEnvelopeItem).toEqual([
      { type: 'profile' },
      expect.objectContaining<Partial<Profile>>({
        event_id: expect.any(String),
        transaction: expect.objectContaining({
          name: 'test-name',
          id: transactionEnvelopeItemPayload.event_id,
          trace_id: transaction.traceId,
        }),
      }),
    ]);
  });

  describe('environment', () => {
    beforeEach(() => {
      (getDefaultEnvironment as jest.Mock).mockReturnValue('mocked');
      mockWrapper.NATIVE.fetchNativeDeviceContexts.mockResolvedValue(<NativeDeviceContextsResponse>{
        environment: 'native',
      });
    });

    const expectTransactionWithEnvironment = (envelope: Envelope | undefined, env: string | undefined) => {
      const transactionEvent = envelope?.[envelopeItems][0][envelopeItemPayload] as Event;
      expect(transactionEvent).toEqual(
        expect.objectContaining<Partial<Event>>({
          environment: env,
        }),
      );
    };

    const expectProfileWithEnvironment = (envelope: Envelope | undefined, env: string | undefined) => {
      const profileEvent = (envelope?.[envelopeItems][1] as [{ type: 'profile' }, Profile])[1];
      expect(profileEvent).toEqual(
        expect.objectContaining<Partial<Profile>>({
          environment: env,
        }),
      );
    };

    test('should use default environment for transaction and profile', () => {
      mock = initTestClient();

      const transaction: Transaction = Sentry.startTransaction({
        name: 'test-name',
      });
      transaction.finish();

      jest.runAllTimers();

      const envelope: Envelope | undefined = mock.transportSendMock.mock.lastCall?.[0];
      expectTransactionWithEnvironment(envelope, 'mocked');
      expectProfileWithEnvironment(envelope, 'mocked');
    });

    test('should use native environment for transaction and profile if user value is nullish', () => {
      mock = initTestClient({ withProfiling: true, environment: '' });

      const transaction: Transaction = Sentry.startTransaction({
        name: 'test-name',
      });
      transaction.finish();

      jest.runAllTimers();

      const envelope: Envelope | undefined = mock.transportSendMock.mock.lastCall?.[0];
      expectTransactionWithEnvironment(envelope, 'native');
      expectProfileWithEnvironment(envelope, 'native');
    });

    test('should keep nullish for transaction and profile uses default', () => {
      mockWrapper.NATIVE.fetchNativeDeviceContexts.mockResolvedValue(<NativeDeviceContextsResponse>{
        environment: undefined,
      });
      mock = initTestClient({ withProfiling: true, environment: undefined });

      const transaction: Transaction = Sentry.startTransaction({
        name: 'test-name',
      });
      transaction.finish();

      jest.runAllTimers();

      const envelope: Envelope | undefined = mock.transportSendMock.mock.lastCall?.[0];
      expectTransactionWithEnvironment(envelope, undefined);
      expectProfileWithEnvironment(envelope, 'mocked');
    });

    test('should keep custom environment for transaction and profile', () => {
      mock = initTestClient({ withProfiling: true, environment: 'custom' });

      const transaction: Transaction = Sentry.startTransaction({
        name: 'test-name',
      });
      transaction.finish();

      jest.runAllTimers();

      const envelope: Envelope | undefined = mock.transportSendMock.mock.lastCall?.[0];
      expectTransactionWithEnvironment(envelope, 'custom');
      expectProfileWithEnvironment(envelope, 'custom');
    });
  });

  describe('with profiling enabled', () => {
    beforeEach(() => {
      mock = initTestClient();
      jest.runAllTimers();
      jest.clearAllMocks();
    });

    test('should create a new profile and add in to the transaction envelope', () => {
      const transaction: Transaction = Sentry.startTransaction({
        name: 'test-name',
      });
      transaction.finish();

      jest.runAllTimers();

      const envelope: Envelope | undefined = mock.transportSendMock.mock.lastCall?.[0];
      const transactionEnvelopeItemPayload = envelope?.[envelopeItems][0][envelopeItemPayload] as Event;
      const profileEnvelopeItem = envelope?.[envelopeItems][1] as [{ type: 'profile' }, Profile];
      expect(profileEnvelopeItem).toEqual([
        { type: 'profile' },
        expect.objectContaining<Partial<Profile>>({
          event_id: expect.any(String),
          transaction: expect.objectContaining({
            name: 'test-name',
            id: transactionEnvelopeItemPayload.event_id,
            trace_id: transaction.traceId,
          }),
        }),
      ]);
    });

    test('should finish previous profile when a new transaction starts', () => {
      const transaction1: Transaction = Sentry.startTransaction({
        name: 'test-name-1',
      });
      const transaction2: Transaction = Sentry.startTransaction({
        name: 'test-name-2',
      });
      transaction1.finish();
      transaction2.finish();

      jest.runAllTimers();

      const envelopeTransaction1: Envelope | undefined = mock.transportSendMock.mock.calls[0][0];
      const transaction1EnvelopeItemPayload = envelopeTransaction1?.[envelopeItems][0][envelopeItemPayload] as Event;
      const profile1EnvelopeItem = envelopeTransaction1?.[envelopeItems][1] as
        | [{ type: 'profile' }, Profile]
        | undefined;

      const envelopeTransaction2: Envelope | undefined = mock.transportSendMock.mock.calls[1][0];
      const transaction2EnvelopeItemPayload = envelopeTransaction2?.[envelopeItems][0][envelopeItemPayload] as Event;
      const profile2EnvelopeItem = envelopeTransaction2?.[envelopeItems][1] as
        | [{ type: 'profile' }, Profile]
        | undefined;

      expect(profile1EnvelopeItem).toEqual([
        { type: 'profile' },
        expect.objectContaining<Partial<Profile>>({
          event_id: expect.any(String),
          transaction: expect.objectContaining({
            name: 'test-name-1',
            id: transaction1EnvelopeItemPayload.event_id,
            trace_id: transaction1.traceId,
          }),
        }),
      ]);
      expect(profile2EnvelopeItem).toEqual([
        { type: 'profile' },
        expect.objectContaining<Partial<Profile>>({
          event_id: expect.any(String),
          transaction: expect.objectContaining({
            name: 'test-name-2',
            id: transaction2EnvelopeItemPayload.event_id,
            trace_id: transaction2.traceId,
          }),
        }),
      ]);
    });

    test('profile should start at the same time as transaction', () => {
      const transaction: Transaction = Sentry.startTransaction({
        name: 'test-name',
      });
      transaction.finish();

      jest.runAllTimers();

      const envelope: Envelope | undefined = mock.transportSendMock.mock.lastCall?.[0];
      const transactionEnvelopeItemPayload = envelope?.[envelopeItems][0][envelopeItemPayload] as Event;
      const profileEnvelopeItemPayload = envelope?.[envelopeItems][1][envelopeItemPayload] as unknown as Profile;
      const transactionStart = Math.floor(transactionEnvelopeItemPayload.start_timestamp! * SEC_TO_MS);
      const profileStart = new Date(profileEnvelopeItemPayload.timestamp).getTime();
      expect(profileStart - transactionStart).toBeLessThan(10);
    });

    test('profile is only recorded until max duration is reached', () => {
      const transaction: Transaction = Sentry.startTransaction({
        name: 'test-name',
      });
      jest.clearAllMocks();

      jest.advanceTimersByTime(40 * 1e6);

      expect(mockWrapper.NATIVE.stopProfiling.mock.calls.length).toEqual(1);

      transaction.finish();
    });

    test('profile that reached max duration is sent', () => {
      const transaction: Transaction = Sentry.startTransaction({
        name: 'test-name',
      });

      jest.advanceTimersByTime(40 * 1e6);

      transaction.finish();

      jest.runAllTimers();

      const envelope: Envelope | undefined = mock.transportSendMock.mock.lastCall?.[0];
      const transactionEnvelopeItemPayload = envelope?.[envelopeItems][0][envelopeItemPayload] as Event;
      const profileEnvelopeItem = envelope?.[envelopeItems][1] as [{ type: 'profile' }, Profile];
      expect(profileEnvelopeItem).toEqual([
        { type: 'profile' },
        expect.objectContaining<Partial<Profile>>({
          event_id: expect.any(String),
          transaction: expect.objectContaining({
            name: 'test-name',
            id: transactionEnvelopeItemPayload.event_id,
            trace_id: transaction.traceId,
          }),
        }),
      ]);
    });

    test('profile timeout is reset when transaction is finished', () => {
      const integration = getCurrentHermesProfilingIntegration();
      const transaction: Transaction = Sentry.startTransaction({
        name: 'test-name',
      });
      const timeoutAfterProfileStarted = integration._currentProfileTimeout;

      jest.advanceTimersByTime(40 * 1e6);

      transaction.finish();
      const timeoutAfterProfileFinished = integration._currentProfileTimeout;

      jest.runAllTimers();

      expect(timeoutAfterProfileStarted).toBeDefined();
      expect(timeoutAfterProfileFinished).toBeUndefined();
    });
  });
});

type TestHermesIntegration = Omit<HermesProfiling, '_currentProfileTimeout'> & {
  _currentProfileTimeout: number | undefined;
};
function getCurrentHermesProfilingIntegration(): TestHermesIntegration {
  const integration = Sentry.getCurrentHub().getClient()?.getIntegration(HermesProfiling);
  if (!integration) {
    throw new Error('HermesProfiling integration is not installed');
  }
  return integration as unknown as TestHermesIntegration;
}

function initTestClient(
  testOptions: {
    withProfiling?: boolean;
    environment?: string;
  } = {
    withProfiling: true,
  },
): {
  transportSendMock: jest.Mock<ReturnType<Transport['send']>, Parameters<Transport['send']>>;
} {
  const transportSendMock = jest.fn<ReturnType<Transport['send']>, Parameters<Transport['send']>>();
  const options: Sentry.ReactNativeOptions = {
    dsn: MOCK_DSN,
    _experiments: {
      profilesSampleRate: 1,
    },
    integrations: integrations => {
      if (!testOptions.withProfiling) {
        return integrations.filter(i => i.name !== 'HermesProfiling');
      }
      return integrations;
    },
    transport: () => ({
      send: transportSendMock.mockResolvedValue(undefined),
      flush: jest.fn().mockResolvedValue(true),
    }),
  };
  if ('environment' in testOptions) {
    options.environment = testOptions.environment;
  }
  Sentry.init(options);

  // In production integrations are setup only once, but in the tests we want them to setup on every init
  const integrations = Sentry.getCurrentHub().getClient()?.getOptions().integrations;
  if (integrations) {
    for (const integration of integrations) {
      integration.setupOnce(Sentry.addGlobalEventProcessor, Sentry.getCurrentHub);
    }
  }

  return {
    transportSendMock,
  };
}

/**
 * Creates a mock Hermes profile that is valid enough to be added to an envelope.
 * Min 2 samples are required by Sentry to be valid.
 */
function createMockMinimalValidHermesProfile(): Hermes.Profile {
  return {
    samples: [
      {
        cpu: '-1',
        name: '',
        ts: '10',
        pid: 54822,
        tid: '14509472',
        weight: '1',
        sf: 1,
      },
      {
        cpu: '-1',
        name: '',
        ts: '20',
        pid: 54822,
        tid: '14509472',
        weight: '1',
        sf: 1,
      },
    ],
    stackFrames: {
      1: {
        name: '[root]',
        category: 'root',
      },
    },
    traceEvents: [],
  };
}
