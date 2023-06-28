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
  line?: string;
  column?: string;
  funcLine?: string;
  funcColumn?: string;
  name: string;
  category: string;
  parent?: number;
}

export interface Profile {
  traceEvents: TraceEvent[];
  samples: Sample[];
  stackFrames: Record<string, StackFrame>;
}

/**
 * Hermes Profile Stack Frame Name contains function name and file path.
 *
 * `foo(/path/to/file.js:1:2)` -> `foo`
 */
export function parseHermesStackFrameFunctionName(hermesName: string): string {
  const indexOfLeftParenthesis = hermesName.indexOf('(');
  const name = indexOfLeftParenthesis !== -1 ? hermesName.substring(0, indexOfLeftParenthesis) : hermesName;
  return name;
}

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
