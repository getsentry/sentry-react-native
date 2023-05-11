import type { ThreadCpuProfile} from '../../src/js/integrations/profiling';
import { convertToSentryProfile } from '../../src/js/integrations/profiling';
import type * as Hermes from '../../src/js/utils/hermes';

describe('Profiling Integration', () => {
  describe('conver hermes profile to sentry profile', () => {
    it('simple test profile', async () => {
      const givenContext = {
        uptimeTimestampNs: 0,
        profileStartTimestampNs: 0,
      };
      const hermesProfile: Hermes.Profile = {
        // TODO:
      };
      const expectedSentryProfile: ThreadCpuProfile = {
        // TODO:
      };
      expect(convertToSentryProfile(hermesProfile, givenContext)).toStrictEqual(expectedSentryProfile);
    });
  });
});
