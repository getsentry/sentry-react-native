import type { ThreadCpuProfile, ThreadCpuSample } from '@sentry/types';

import { convertToSentryProfile, mapSamples } from '../../src/js/profiling/convertHermesProfile';
import type * as Hermes from '../../src/js/profiling/hermes';

describe('convert hermes profile to sentry profile', () => {
  it('simple test profile', async () => {
    const hermesProfile: Hermes.Profile = {
      traceEvents: [],
      samples: [
        {
          cpu: '-1',
          name: '',
          ts: '10',
          pid: 54822,
          tid: '14509472',
          weight: '1',
          sf: 4,
        },
        {
          cpu: '-1',
          name: '',
          ts: '20',
          pid: 54822,
          tid: '14509472',
          weight: '1',
          sf: 4,
        },
        {
          cpu: '-1',
          name: '',
          ts: '30',
          pid: 54822,
          tid: '14509472',
          weight: '1',
          sf: 1,
        },
        {
          cpu: '-1',
          name: '',
          ts: '40',
          pid: 54822,
          tid: '14509472',
          weight: '1',
          sf: 3,
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
          name: 'fooA(/absolute/path/app:///main.jsbundle:1610:33)',
          category: 'JavaScript',
          parent: 1,
        },
        3: {
          line: '1616',
          column: '21',
          funcLine: '1614',
          funcColumn: '14',
          name: 'fooB(/absolute/path/app:///main.jsbundle:1616:21)',
          category: 'JavaScript',
          parent: 1,
        },
        4: {
          line: '1627',
          column: '18',
          funcLine: '1623',
          funcColumn: '16',
          name: '(/absolute/path/app:///main.jsbundle:1627:18)',
          category: 'JavaScript',
          parent: 2,
        },
      },
    };
    const expectedSentryProfile: ThreadCpuProfile = {
      frames: [
        {
          colno: undefined,
          file: undefined,
          function: '[root]',
          lineno: undefined,
        },
        {
          colno: 33,
          file: 'app:///main.jsbundle',
          function: 'fooA',
          lineno: 1610,
        },
        {
          colno: 21,
          file: 'app:///main.jsbundle',
          function: 'fooB',
          lineno: 1616,
        },
        {
          colno: 18,
          file: 'app:///main.jsbundle',
          function: 'anonymous',
          lineno: 1627,
        },
      ],
      samples: [
        {
          elapsed_since_start_ns: '0',
          stack_id: 0,
          thread_id: '14509472',
        },
        {
          elapsed_since_start_ns: '10000',
          stack_id: 0,
          thread_id: '14509472',
        },
        {
          elapsed_since_start_ns: '20000',
          stack_id: 1,
          thread_id: '14509472',
        },
        {
          elapsed_since_start_ns: '30000',
          stack_id: 2,
          thread_id: '14509472',
        },
      ],
      stacks: [[3, 1, 0], [0], [2, 0]],
      thread_metadata: {
        '14509472': {
          name: 'JavaScriptThread',
          priority: 1,
        },
      },
    };
    expect(convertToSentryProfile(hermesProfile)).toStrictEqual(expectedSentryProfile);
  });

  describe('converts profile samples', () => {
    it('removes samples that are over the max duration of profile', () => {
      const TEST_MAX_PROFILE_DURATION = 1000;
      const hermesSamples: Hermes.Sample[] = [
        {
          ...getMinimumHermesSample(),
          ts: '1',
        },
        {
          ...getMinimumHermesSample(),
          ts: '3',
        },
      ];
      const expectedSentrySamples: ThreadCpuSample[] = [
        {
          ...getMinimumSentrySample(),
          elapsed_since_start_ns: '0',
        },
      ];
      expect(mapSamples(hermesSamples, TEST_MAX_PROFILE_DURATION).samples).toStrictEqual(expectedSentrySamples);
    });

    it('removes samples that are equal the max duration of profile', () => {
      const TEST_MAX_PROFILE_DURATION = 1000;
      const hermesSamples: Hermes.Sample[] = [
        {
          ...getMinimumHermesSample(),
          ts: '1',
        },
        {
          ...getMinimumHermesSample(),
          ts: '2',
        },
      ];
      const expectedSentrySamples: ThreadCpuSample[] = [
        {
          ...getMinimumSentrySample(),
          elapsed_since_start_ns: '0',
        },
      ];
      expect(mapSamples(hermesSamples, TEST_MAX_PROFILE_DURATION).samples).toStrictEqual(expectedSentrySamples);
    });

    function getMinimumHermesSample(): Hermes.Sample {
      return {
        cpu: '-1',
        name: '',
        ts: '1',
        pid: 54822,
        tid: '14509472',
        weight: '1',
        sf: 4,
      };
    }

    function getMinimumSentrySample(): ThreadCpuSample {
      return {
        elapsed_since_start_ns: '0',
        stack_id: 4,
        thread_id: '14509472',
      };
    }
  });
});
