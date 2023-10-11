import type { ThreadCpuProfile } from '@sentry/types';

export interface RawThreadCpuProfile extends ThreadCpuProfile {
  resources: string[];
  profile_id?: string;
}
