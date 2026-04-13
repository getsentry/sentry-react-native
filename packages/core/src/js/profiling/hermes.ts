import { Platform } from 'react-native';

import { ANDROID_DEFAULT_BUNDLE_NAME, IOS_DEFAULT_BUNDLE_NAME } from '../integrations/rewriteframes';

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
