import type { ThreadCpuFrame as SentryThreadCpuFrame, ThreadCpuProfile } from '@sentry/types';

export interface ThreadCpuFrame extends SentryThreadCpuFrame {
  in_app?: boolean;
}

export interface RawThreadCpuProfile extends ThreadCpuProfile {
  frames: ThreadCpuFrame[];
  profile_id?: string;
  active_thread_id: string;
}
