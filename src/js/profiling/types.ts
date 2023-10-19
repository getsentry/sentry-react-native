import type { ThreadCpuFrame, ThreadCpuProfile } from '@sentry/types';

export interface RawThreadCpuProfile extends ThreadCpuProfile {
  frames: ThreadCpuFrame[];
  profile_id?: string;
  active_thread_id: string;
}
