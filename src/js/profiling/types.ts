import type { Profile, ThreadCpuFrame as SentryThreadCpuFrame, ThreadCpuProfile } from '@sentry/types';

import type { NativeProfileEvent } from './nativeTypes';

export interface ThreadCpuFrame extends SentryThreadCpuFrame {
  in_app?: boolean;
}

export interface RawThreadCpuProfile extends ThreadCpuProfile {
  frames: ThreadCpuFrame[];
  profile_id?: string;
  active_thread_id: string;
}

export type HermesProfileEvent = {
  platform: 'javascript';
  version: '1';
  profile: ThreadCpuProfile;
  transaction: {
    active_thread_id: string;
  };
};

export type ProfileEvent = Profile;

export type CombinedProfileEvent = HermesProfileEvent & Partial<NativeProfileEvent>;
