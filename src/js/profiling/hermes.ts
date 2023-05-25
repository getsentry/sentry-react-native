import { NATIVE } from '../wrapper';
import {
  convertToSentryProfile,
} from './convertHermesProfile';
import type {
  ThreadCpuProfile,
} from './types';

export type StackFrameId = number;
export type MicrosecondsSinceBoot = string;

export interface TraceEvent {
  name: string,
  ph: string,
  cat: string,
  pid: number,
  ts: MicrosecondsSinceBoot,
  tid: string,
  args: {
    name?: string,
  },
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

export interface HermesStackFrameNameParsed {
  function?: string;
  fileName?: string;
}

const FILE_NAME_REGEX = /([a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)(?::(\d+:\d+))?\)/;
/**
 * Hermes Profile Stack Frame Name contains function name and file path.
 *
 * `foo(/path/to/file.js:1:2)` -> `{ function: 'foo', fileName: 'file.js' }`
 */
export function parseHermesStackFrameName(name: string): HermesStackFrameNameParsed {
  const result: HermesStackFrameNameParsed = {};
  const match = FILE_NAME_REGEX.exec(name);
  if (match) {
    result.fileName = match[1];
  }
  result.function = name.split('(')[0]
  return result;
}


const MS_TO_NS: number = 1e6;

/**
 * Starts Hermes Sampling Profiler and returns the timestamp when profiling started in nanoseconds.
 */
export function startProfiling(): number {
  const profileStartTimestampNs = Date.now() * MS_TO_NS;
  void NATIVE.startProfiling();
  return profileStartTimestampNs;
}

/**
 * Stops Hermes Sampling Profiler and returns the profile.
 */
export function stopProfiling(): ThreadCpuProfile | null {
  const hermesProfile = NATIVE.stopProfiling();
  if (!hermesProfile) {
    return null;
  }
  return convertToSentryProfile(hermesProfile);
}

