import { Platform } from 'react-native';

import { ANDROID_DEFAULT_BUNDLE_NAME, IOS_DEFAULT_BUNDLE_NAME } from '../integrations/rewriteframes';
import { NATIVE } from '../wrapper';
import { convertToSentryProfile } from './convertHermesProfile';
import type { RawThreadCpuProfile } from './types';

export type StackFrameId = number;
export type MicrosecondsSinceBoot = string;

export interface TraceEvent {
  name: string;
  ph: string;
  cat: string;
  pid: number;
  ts: MicrosecondsSinceBoot;
  tid: string;
  args: {
    name?: string;
  };
}

export interface Sample {
  cpu: string;
  name: string;
  ts: MicrosecondsSinceBoot;
  pid: number;
  tid: string;
  weight: string;
  sf: StackFrameId;
}

export interface StackFrame {
  // Hermes Bytecode
  funcVirtAddr?: string;
  offset?: string;

  // JavaScript
  line?: string;
  column?: string;
  funcLine?: string;
  funcColumn?: string;

  // Common
  name: string;
  category: string;
  parent?: number;
}

export interface Profile {
  traceEvents: TraceEvent[];
  samples: Sample[];
  stackFrames: Record<string, StackFrame>;
}

export const DEFAULT_BUNDLE_NAME =
  Platform.OS === 'android' ? ANDROID_DEFAULT_BUNDLE_NAME : Platform.OS === 'ios' ? IOS_DEFAULT_BUNDLE_NAME : undefined;

const MS_TO_NS: number = 1e6;

/**
 * Starts Hermes Sampling Profiler and returns the timestamp when profiling started in nanoseconds.
 */
export function startProfiling(): number | null {
  const started = NATIVE.startProfiling();
  if (!started) {
    return null;
  }

  const profileStartTimestampNs = Date.now() * MS_TO_NS;
  return profileStartTimestampNs;
}

/**
 * Stops Hermes Sampling Profiler and returns the profile.
 */
export function stopProfiling(): RawThreadCpuProfile | null {
  const hermesProfile = NATIVE.stopProfiling();
  if (!hermesProfile) {
    return null;
  }
  return convertToSentryProfile(hermesProfile);
}
