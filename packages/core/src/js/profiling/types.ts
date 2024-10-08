import type { DebugImage, MeasurementUnit, Profile, ThreadCpuFrame, ThreadCpuProfile } from '@sentry/types';

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

/*
 * Android profile with javascript without transaction metadata
 */
export type AndroidCombinedProfileEvent = {
  platform: 'android';
  /**
   * Proguard debug meta image uuid
   */
  build_id?: string | undefined;
  sampled_profile: string;
  js_profile: ThreadCpuProfile;
  android_api_level: number;
  duration_ns: string;
  active_thread_id: string;
};

/*
 * Complete Android profile with javascript and transaction metadata
 */
export type AndroidProfileEvent = {
  sampled_profile: string;
  /**
   * Currently used only for JS
   */
  debug_meta?: {
    images: DebugImage[];
  };
  js_profile: ThreadCpuProfile;

  android_api_level: number;
  /**
   * Proguard debug meta image uuid
   */
  build_id: string;

  device_cpu_frequencies: number[];
  device_is_emulator: boolean;
  device_locale: string;
  device_manufacturer: string;
  device_model: string;
  device_os_name: string;
  device_os_version: string;

  device_physical_memory_bytes: string;

  environment: string;

  platform: 'android';
  profile_id: string;

  timestamp: string;

  release: string;
  dist: string;

  version_code: string;
  version_name: string;

  transaction_id: string;
  transaction_name: string;
  trace_id: string;
  duration_ns: string;
  active_thread_id: string;

  measurements?: Record<
    string,
    {
      unit: MeasurementUnit;
      values: {
        elapsed_since_start_ns: number;
        value: number;
      }[];
    }
  >;

  transaction_metadata?: Record<string, string>;
  transaction_tags?: Record<string, string>;
};

export type ProfileEvent = Profile | AndroidProfileEvent;

export type CombinedProfileEvent = HermesProfileEvent & Partial<NativeProfileEvent>;
