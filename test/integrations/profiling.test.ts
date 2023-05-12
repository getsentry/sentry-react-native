import type { ThreadCpuProfile} from '../../src/js/integrations/profiling';
import { convertToSentryProfile } from '../../src/js/integrations/profiling';
import type * as Hermes from '../../src/js/utils/hermes';

describe('Profiling Integration', () => {
  describe('convert hermes profile to sentry profile', () => {
    it('simple test profile', async () => {
      const givenContext = {
        uptimeTimestampNs: 0,
        profileStartTimestampNs: 0,
      };
      const hermesProfile: Hermes.Profile = {
        'traceEvents': [],
        'samples': [
          {
            'cpu': '-1',
            'name': '',
            'ts': '1896623880553',
            'pid': 54822,
            'tid': '14509472',
            'weight': '1',
            'sf': 1
          },
          {
            'cpu': '-1',
            'name': '',
            'ts': '1896623902244',
            'pid': 54822,
            'tid': '14509472',
            'weight': '1',
            'sf': 1
          },
        ],
        'stackFrames': {
          '1': {
            'name': '[root]',
            'category': 'root'
          },
          '2': {
            'line': '1610',
            'column': '33',
            'funcLine': '1605',
            'funcColumn': '14',
            'name': 'invokeCallbackAndReturnFlushedQueue(/Users/krystofwoldrich/Library/Developer/Xcode/DerivedData/sampleNewArchitecture-dtnzzmpchfyuyyajisnbghavfleb/Build/Products/Release-iphonesimulator/main.jsbundle:1610:33)',
            'category': 'JavaScript',
            'parent': 1
          },
          '3': {
            'line': '1616',
            'column': '21',
            'funcLine': '1614',
            'funcColumn': '14',
            'name': 'flushedQueue(/Users/krystofwoldrich/Library/Developer/Xcode/DerivedData/sampleNewArchitecture-dtnzzmpchfyuyyajisnbghavfleb/Build/Products/Release-iphonesimulator/main.jsbundle:1616:21)',
            'category': 'JavaScript',
            'parent': 2
          },
        },
      };
      const expectedSentryProfile: ThreadCpuProfile = {
        'frames': [
          {
            'column': undefined,
            'file': undefined,
            'function': '[root]',
            'line': undefined,
          },
          {
            'column': 33,
            'file': 'main.jsbundle',
            'function': 'invokeCallbackAndReturnFlushedQueue',
            'line': 1610,
          },
          {
            'column': 21,
            'file': 'main.jsbundle',
            'function': 'flushedQueue',
            'line': 1616,
          },
        ],
        'samples':  [
          {
            'elapsed_since_start_ns': '-1896623880553000',
            'stack_id': -1,
            'thread_id': '14509472',
          },
          {
            'elapsed_since_start_ns': '-1896623902244000',
            'stack_id': -1,
            'thread_id': '14509472',
          },
        ],
        'stacks':  [
          [
            0,
            1,
            2,
          ],
        ],
        'thread_metadata':  {
          '14509472':  {
            'name': 'JavaScriptThread',
            'priority': 1,
          },
        },
      };
      expect(convertToSentryProfile(hermesProfile, givenContext)).toStrictEqual(expectedSentryProfile);
    });
  });
});
