import type { ThreadCpuProfile } from '@sentry/types';

export interface RawThreadCpuProfile extends ThreadCpuProfile {
  profile_id?: string;
}
