import * as mockWrapper from '../mockWrapper';
jest.mock('../../src/js/wrapper', () => mockWrapper);
jest.mock('../../src/js/utils/environment');

import type { Envelope, Event, Profile, ThreadCpuProfile, ThreadCpuSample, Transaction, Transport } from '@sentry/types';

import * as Sentry from '../../src/js';
import { HermesProfiling } from '../../src/js/integrations';
import { isHermesEnabled } from '../../src/js/utils/environment';
import { RN_GLOBAL_OBJ } from '../../src/js/utils/worldwide';
import { MOCK_DSN } from '../mockDsn';
import { envelopeItemPayload, envelopeItems } from '../testutils';
import { createMockMinimalValidHermesProfile, createThreeConsecutiveMinimalValidHermesProfiles,MOCK_THREAD_ID } from './integration.fixtures';

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
    mock = initTestClient();
    jest.runAllTimers();
    jest.clearAllMocks();
  });

  afterEach(async() => {
    jest.runAllTimers();
    jest.useRealTimers();
    RN_GLOBAL_OBJ.__SENTRY__.globalEventProcessors = []; // resets integrations
    await Sentry.close();
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

  test('should profile two concurrent transactions', () => {
    const hermesProfiles = createThreeConsecutiveMinimalValidHermesProfiles();
    mockWrapper.NATIVE.stopProfiling.mockReset()
      .mockReturnValueOnce(hermesProfiles.first)
      .mockReturnValueOnce(hermesProfiles.second)
      .mockReturnValueOnce(hermesProfiles.third);

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
    const profile1EnvelopeItem = envelopeTransaction1?.[envelopeItems][1] as [{ type: 'profile' }, Profile] | undefined;

    const envelopeTransaction2: Envelope | undefined = mock.transportSendMock.mock.calls[1][0];
    const transaction2EnvelopeItemPayload = envelopeTransaction2?.[envelopeItems][0][envelopeItemPayload] as Event;
    const profile2EnvelopeItem = envelopeTransaction2?.[envelopeItems][1] as [{ type: 'profile' }, Profile] | undefined;

    expect(profile1EnvelopeItem).toEqual([
      { type: 'profile' },
      expect.objectContaining<Partial<Profile>>({
        event_id: expect.any(String),
        transaction: expect.objectContaining({
          name: 'test-name-1',
          id: transaction1EnvelopeItemPayload.event_id,
          trace_id: transaction1.traceId,
        }),
        profile: expect.objectContaining<Partial<ThreadCpuProfile>>({
          samples: [
            {
              thread_id: MOCK_THREAD_ID,
              stack_id: 0,
              elapsed_since_start_ns: '0',
            },
            {
              thread_id: MOCK_THREAD_ID,
              stack_id: 0,
              elapsed_since_start_ns: '10',
            },
            {
              thread_id: MOCK_THREAD_ID,
              stack_id: 1,
              elapsed_since_start_ns: '20',
            },
            {
              thread_id: MOCK_THREAD_ID,
              stack_id: 1,
              elapsed_since_start_ns: '30',
            },
          ],
          frames: [
            {
              function: '[root]',
            },
            {
              function: 'fooA',
              line: 1610,
              column: 33,
              file: 'main.jsbundle',
            },
            {
              column: undefined,
              file: undefined,
              function: '[root]',
              line: undefined,
            },
            {
              function: 'fooB',
              line: 1620,
              column: 33,
              file: 'second.jsbundle',
            },
          ],
          stacks: [
            [
              1,
              0,
            ],
            [
              3,
              2,
            ],
          ],
          thread_metadata: {
            [MOCK_THREAD_ID]: {
              name: 'JavaScriptThread',
              priority: 1,
            }
          },
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
        profile: expect.objectContaining<Partial<ThreadCpuProfile>>({
          samples: [
            {
              thread_id: MOCK_THREAD_ID,
              stack_id: 0,
              elapsed_since_start_ns: '0',
            },
            {
              thread_id: MOCK_THREAD_ID,
              stack_id: 0,
              elapsed_since_start_ns: '10',
            },
            {
              thread_id: MOCK_THREAD_ID,
              stack_id: 1,
              elapsed_since_start_ns: '20',
            },
            {
              thread_id: MOCK_THREAD_ID,
              stack_id: 1,
              elapsed_since_start_ns: '30',
            },
          ],
          frames: [
            {
              function: '[root]',
            },
            {
              function: 'fooB',
              line: 1620,
              column: 33,
              file: 'second.jsbundle',
            },
            {
              function: '[root]',
            },
            {
              function: 'fooC',
              line: 1630,
              column: 33,
              file: 'third.jsbundle',
            },
          ],
          stacks: [
            [
              1,
              0,
            ],
            [
              3,
              2,
            ],
          ],
          thread_metadata: {
            [MOCK_THREAD_ID]: {
              name: 'JavaScriptThread',
              priority: 1,
            }
          },
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
    const profileStart = (new Date(profileEnvelopeItemPayload.timestamp)).getTime();
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

let isFirstInit = true;
function initTestClient(): {
  transportSendMock: jest.Mock<ReturnType<Transport['send']>, Parameters<Transport['send']>>;
} {
  const transportSendMock = jest.fn<ReturnType<Transport['send']>, Parameters<Transport['send']>>();
  Sentry.init({
    dsn: MOCK_DSN,
    _experiments: {
      profilesSampleRate: 1,
    },
    transport: () => ({
      send: transportSendMock.mockResolvedValue(undefined),
      flush: jest.fn().mockResolvedValue(true),
    }),
  });

  if (!isFirstInit) {
    isFirstInit = false;
    // In production integrations are setup only once, but in the tests we want them to setup on every init
    const integrations = Sentry.getCurrentHub().getClient()?.getOptions().integrations
    if (integrations) {
      for (const integration of integrations) {
        integration.setupOnce(Sentry.addGlobalEventProcessor, Sentry.getCurrentHub);
      }
    }
  }

  return {
    transportSendMock,
  };
}
