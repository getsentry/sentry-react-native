import type { DebugImage, MeasurementUnit } from '@sentry/types';

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

// TMP: Until types update in @sentry/types is released
export type ThreadId = string;
export type FrameId = number;
export type StackId = number;

export interface ThreadCpuSample {
  stack_id: StackId;
  thread_id: ThreadId;
  queue_address?: string;
  elapsed_since_start_ns: string;
}

export type ThreadCpuStack = FrameId[];

export type ThreadCpuFrame = {
  function?: string;
  file?: string;
  lineno?: number;
  colno?: number;
  abs_path?: string;
  platform?: string;
  instruction_addr?: string;
  module?: string;
  in_app?: boolean;
};

export interface ThreadCpuProfile {
  samples: ThreadCpuSample[];
  stacks: ThreadCpuStack[];
  frames: ThreadCpuFrame[];
  thread_metadata: Record<ThreadId, { name?: string; priority?: number }>;
  queue_metadata?: Record<string, { label: string }>;
}

export interface Profile {
  event_id: string;
  version: string;
  os: {
    name: string;
    version: string;
    build_number?: string;
  };
  runtime: {
    name: string;
    version: string;
  };
  device: {
    architecture: string;
    is_emulator: boolean;
    locale: string;
    manufacturer: string;
    model: string;
  };
  timestamp: string;
  release: string;
  environment: string;
  platform: string;
  profile: ThreadCpuProfile;
  debug_meta?: {
    images: (DebugImage | MachoDebugImage)[];
  };
  transaction?: {
    name: string;
    id: string;
    trace_id: string;
    active_thread_id: string;
  };
  transactions?: {
    name: string;
    id: string;
    trace_id: string;
    active_thread_id: string;
    relative_start_ns: string;
    relative_end_ns: string;
  }[];
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
}

interface MachoDebugImage {
  type: 'macho';
  debug_id: string;
  image_addr: string;
  image_size?: number;
  code_file?: string;
}
