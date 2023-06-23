import type * as Hermes from '../../src/js/profiling/hermes';

export const MOCK_THREAD_ID = '14509472';

/**
 * Creates a mock Hermes profile that is valid enough to be added to an envelope.
 * Min 2 samples are required by Sentry to be valid.
 */
export function createMockMinimalValidHermesProfile(): Hermes.Profile {
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

/**
 * Creates three consecutive Hermes profiles.
 * This is useful for testing correct profiling of concurrent transactions.
 */
export function createThreeConsecutiveMinimalValidHermesProfiles(): {
  first: Hermes.Profile;
  second: Hermes.Profile;
  third: Hermes.Profile;
} {
  return {
    first: {
      samples: [
        {
          cpu: '-1',
          name: '',
          ts: '10',
          pid: 54822,
          tid: MOCK_THREAD_ID,
          weight: '1',
          sf: 2,
        },
        {
          cpu: '-1',
          name: '',
          ts: '20',
          pid: 54822,
          tid: MOCK_THREAD_ID,
          weight: '1',
          sf: 2,
        },
      ],
      stackFrames: {
        1: {
          name: '[root]',
          category: 'root',
        },
        2: {
          line: '1610',
          column: '33',
          funcLine: '1605',
          funcColumn: '14',
          name: 'fooA(/absolute/path/main.jsbundle:1610:33)',
          category: 'JavaScript',
          parent: 1,
        },
      },
      traceEvents: [],
    },
    second: {
      samples: [
        {
          cpu: '-1',
          name: '',
          ts: '30',
          pid: 54822,
          tid: MOCK_THREAD_ID,
          weight: '1',
          sf: 2,
        },
        {
          cpu: '-1',
          name: '',
          ts: '40',
          pid: 54822,
          tid: MOCK_THREAD_ID,
          weight: '1',
          sf: 2,
        },
      ],
      stackFrames: {
        1: {
          name: '[root]',
          category: 'root',
        },
        2: {
          line: '1620',
          column: '33',
          funcLine: '1605',
          funcColumn: '14',
          name: 'fooB(/absolute/path/second.jsbundle:1620:33)',
          category: 'JavaScript',
          parent: 1,
        },
      },
      traceEvents: [],
    },
    third: {
      samples: [
        {
          cpu: '-1',
          name: '',
          ts: '50',
          pid: 54822,
          tid: MOCK_THREAD_ID,
          weight: '1',
          sf: 2,
        },
        {
          cpu: '-1',
          name: '',
          ts: '60',
          pid: 54822,
          tid: MOCK_THREAD_ID,
          weight: '1',
          sf: 2,
        },
      ],
      stackFrames: {
        1: {
          name: '[root]',
          category: 'root',
        },
        2: {
          line: '1630',
          column: '33',
          funcLine: '1605',
          funcColumn: '14',
          name: 'fooC(/absolute/path/third.jsbundle:1630:33)',
          category: 'JavaScript',
          parent: 1,
        },
      },
      traceEvents: [],
    },
  }
}
