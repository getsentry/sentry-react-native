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

export interface ParsedHermesStackFrame {
  function: string;
  file?: string;
  lineno?: number;
  colno?: number;
}

const DEFAULT_BUNDLE_NAME =
  Platform.OS === 'android' ? ANDROID_DEFAULT_BUNDLE_NAME : Platform.OS === 'ios' ? IOS_DEFAULT_BUNDLE_NAME : undefined;
const ANONYMOUS_FUNCTION_NAME = 'anonymous';

/**
 * Parses Hermes StackFrame to Sentry StackFrame.
 * For native frames only function name is returned, for Hermes bytecode the line and column are calculated.
 */
export function parseHermesJSStackFrame(frame: StackFrame): ParsedHermesStackFrame {
  if (frame.category !== 'JavaScript') {
    // Native
    return { function: frame.name };
  }

  if (frame.funcVirtAddr !== undefined && frame.offset !== undefined) {
    // Hermes Bytecode
    return {
      function: frame.name || ANONYMOUS_FUNCTION_NAME,
      file: DEFAULT_BUNDLE_NAME,
      // https://github.com/krystofwoldrich/metro/blob/417e6f276ff9422af6039fc4d1bce41fcf7d9f46/packages/metro-symbolicate/src/Symbolication.js#L298-L301
      // Hermes lineno is hardcoded 1, currently only one bundle symbolication is supported by metro-symbolicate and thus by us.
      lineno: 1,
      // Hermes colno is 0-based, while Sentry is 1-based
      colno: Number(frame.funcVirtAddr) + Number(frame.offset) + 1,
    };
  }

  // JavaScript
  const indexOfLeftParenthesis = frame.name.indexOf('(');
  return {
    function:
      (indexOfLeftParenthesis !== -1 && (frame.name.substring(0, indexOfLeftParenthesis) || ANONYMOUS_FUNCTION_NAME)) ||
      frame.name,
    file: DEFAULT_BUNDLE_NAME,
    lineno: frame.line !== undefined ? Number(frame.line) : undefined,
    colno: frame.column !== undefined ? Number(frame.column) : undefined,
  };
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
