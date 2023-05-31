import * as mockWrapper from '../mockWrapper';
jest.mock('../../src/js/wrapper', () => mockWrapper);
jest.mock('../../src/js/utils/environment');

import type { Envelope, Event, Transaction, Transport } from '@sentry/types';

import * as Sentry from '../../src/js';
import type * as Hermes from '../../src/js/profiling/hermes';
import type { Profile, ThreadCpuProfile } from '../../src/js/profiling/types';
import { isHermesEnabled } from '../../src/js/utils/environment';
import { MOCK_DSN } from '../mockDsn';
import { envelopeItemPayload, envelopeItems } from '../testutils';

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

  afterEach(() => {
    jest.runAllTimers();
    jest.useRealTimers();
  });

  test('should create a new profile and add in to the transaction envelope', () => {
    const transaction: Transaction = Sentry.startTransaction({
      name: 'test-name',
      op: 'test-op',
    });
    transaction.finish();

    jest.runAllTimers();

    const envelope: Envelope | undefined = mock.transportSendMock.mock.lastCall?.[0];
    const transactionEnvelopeItemPayload = envelope?.[envelopeItems][0][envelopeItemPayload] as Event;
    const profileEnvelopeItem = envelope?.[envelopeItems][1] as [{ type: 'profile' }, Profile];
    expect(profileEnvelopeItem).toEqual([
      { type: 'profile' },
      expect.objectContaining<Partial<Profile>>({
        event_id: profileEnvelopeItem?.[envelopeItemPayload]?.profile?.profile_id,
        transaction: expect.objectContaining({
          name: 'test-name',
          id: transactionEnvelopeItemPayload.event_id,
          trace_id: transaction.traceId,
        }),
        profile: expect.objectContaining<Partial<ThreadCpuProfile>>({
          profile_id: expect.any(String),
        }),
      }),
    ]);
  });

  test('should finish previous profile when a new transaction starts', () => {});
});

function initTestClient(): {
  transportSendMock: jest.Mock<ReturnType<Transport['send']>, Parameters<Transport['send']>>;
} {
  const transportSendMock = jest.fn<ReturnType<Transport['send']>, Parameters<Transport['send']>>();
  Sentry.init({
    dsn: MOCK_DSN,
    _experiments: {
      profileSampleRate: 1,
    },
    transport: () => ({
      send: transportSendMock.mockResolvedValue(undefined),
      flush: jest.fn().mockResolvedValue(true),
    }),
  });

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
