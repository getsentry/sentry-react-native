import type { Profile, ThreadCpuFrame, ThreadCpuProfile } from '@sentry/types';

import type { NativeProfileEvent } from './nativeTypes';

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

/*
* Android profile with javascript without transaction metadata
*/
export type AndroidCombinedProfileEvent = {
  platform: 'android';
  sampledProfile: string;
  jsProfile: RawThreadCpuProfile;
};

/*
* Complete Android profile with javascript and transaction metadata
*/
export type AndroidProfileEvent = {
  // TODO: Create Android Profile structure
}
