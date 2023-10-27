import type { FrameId, StackId, ThreadCpuFrame, ThreadCpuSample, ThreadCpuStack, ThreadId } from '@sentry/types';
import { logger } from '@sentry/utils';

import type * as Hermes from './hermes';
import { DEFAULT_BUNDLE_NAME } from './hermes';
import { MAX_PROFILE_DURATION_MS } from './integration';
import type { RawThreadCpuProfile } from './types';

const PLACEHOLDER_THREAD_ID_STRING = '0';
const MS_TO_NS = 1e6;
const MAX_PROFILE_DURATION_NS = MAX_PROFILE_DURATION_MS * MS_TO_NS;
const UNKNOWN_STACK_ID = -1;
const JS_THREAD_NAME = 'JavaScriptThread';
const JS_THREAD_PRIORITY = 1;

/**
 * Converts a Hermes profile to a Sentry profile.
 *
 * Maps Hermes samples to Sentry samples.
 * Maps Hermes stack frames to Sentry frames.
 * Hermes stack frame is an object representing a function call in the stack
 * with a link to its parent stack frame. Root of the represented stack tree
 * is main function call in Hermes that is [root] stack frame.
 *
 * @returns Sentry profile or null if no samples are found.
 */
export function convertToSentryProfile(hermesProfile: Hermes.Profile): RawThreadCpuProfile | null {
  if (hermesProfile.samples.length === 0) {
    logger.warn('[Profiling] No samples found in profile.');
    return null;
  }

  const { samples, hermesStacks, jsThreads } = mapSamples(hermesProfile.samples);

  const { frames, hermesStackFrameIdToSentryFrameIdMap } = mapFrames(hermesProfile.stackFrames);

  const { stacks, hermesStackToSentryStackMap } = mapStacks(
    hermesStacks,
    hermesProfile.stackFrames,
    hermesStackFrameIdToSentryFrameIdMap,
  );

  for (const sample of samples) {
    const sentryStackId = hermesStackToSentryStackMap.get(sample.stack_id);
    if (sentryStackId === undefined) {
      logger.error(`[Profiling] Hermes Stack ID ${sample.stack_id} not found when mapping to Sentry Stack ID.`);
      sample.stack_id = UNKNOWN_STACK_ID;
    } else {
      sample.stack_id = sentryStackId;
    }
  }

  const thread_metadata: Record<ThreadId, { name?: string; priority?: number }> = {};
  for (const jsThreadId of jsThreads) {
    thread_metadata[jsThreadId] = {
      name: JS_THREAD_NAME,
      priority: JS_THREAD_PRIORITY,
    };
  }
  const active_thread_id = Object.keys(thread_metadata)[0] || PLACEHOLDER_THREAD_ID_STRING;

  return {
    samples,
    frames,
    stacks,
    thread_metadata,
    active_thread_id,
  };
}

/**
 * Maps Hermes samples to Sentry samples.
 * Calculates the elapsed time since the first sample based on the absolute timestamps of the Hermes samples.
 * Hermes stack frame IDs represent the last (leaf, furthest from the main func) frame of the call stack.
 * @returns the mapped Sentry samples, the set of Hermes stack frame IDs, and the set of JS thread IDs
 */
export function mapSamples(
  hermesSamples: Hermes.Sample[],
  maxElapsedSinceStartNs: number = MAX_PROFILE_DURATION_NS,
): {
  samples: ThreadCpuSample[];
  hermesStacks: Set<Hermes.StackFrameId>;
  jsThreads: Set<ThreadId>;
} {
  const jsThreads = new Set<ThreadId>();
  const hermesStacks = new Set<Hermes.StackFrameId>();

  const start = Number(hermesSamples[0].ts);
  const samples: ThreadCpuSample[] = [];
  for (const hermesSample of hermesSamples) {
    jsThreads.add(hermesSample.tid);
    hermesStacks.add(hermesSample.sf);

    const elapsed_since_start_ns = (Number(hermesSample.ts) - start) * 1e3;
    if (elapsed_since_start_ns >= maxElapsedSinceStartNs) {
      logger.warn(
        `[Profiling] Sample has elapsed time since start ${elapsed_since_start_ns}ns ` +
          `greater than the max elapsed time ${maxElapsedSinceStartNs}ns.`,
      );
      break;
    }

    samples.push({
      stack_id: hermesSample.sf,
      thread_id: hermesSample.tid,
      elapsed_since_start_ns: elapsed_since_start_ns.toFixed(0),
    });
  }

  return {
    samples,
    hermesStacks,
    jsThreads,
  };
}

/**
 * Maps Hermes StackFrames tree represented as an JS object to a Sentry frames array.
 * Converts line and columns strings to numbers.
 * @returns the mapped Sentry frames
 */
function mapFrames(hermesStackFrames: Record<Hermes.StackFrameId, Hermes.StackFrame>): {
  frames: ThreadCpuFrame[];
  hermesStackFrameIdToSentryFrameIdMap: Map<Hermes.StackFrameId, FrameId>;
} {
  const frames: ThreadCpuFrame[] = [];
  const hermesStackFrameIdToSentryFrameIdMap = new Map<Hermes.StackFrameId, FrameId>();
  for (const key in hermesStackFrames) {
    // asc order based on the key is not guaranteed
    if (!Object.prototype.hasOwnProperty.call(hermesStackFrames, key)) {
      continue;
    }
    hermesStackFrameIdToSentryFrameIdMap.set(Number(key), frames.length);
    frames.push(parseHermesJSStackFrame(hermesStackFrames[key]));
  }

  return {
    frames,
    hermesStackFrameIdToSentryFrameIdMap,
  };
}

/**
 * Maps Hermes stack frame IDs to Sentry stack arrays.
 * Hermes stack frame IDs represent the last (leaf, furthest from the main func) frame of the call stack.
 * @returns the mapped Sentry stacks and a map from Hermes stack IDs to Sentry stack IDs (indices in the stacks array)
 */
function mapStacks(
  hermesStacks: Set<Hermes.StackFrameId>,
  hermesStackFrames: Record<Hermes.StackFrameId, Hermes.StackFrame>,
  hermesStackFrameIdToSentryFrameIdMap: Map<Hermes.StackFrameId, FrameId>,
): {
  stacks: ThreadCpuStack[];
  hermesStackToSentryStackMap: Map<Hermes.StackFrameId, StackId>;
} {
  const hermesStackToSentryStackMap = new Map<Hermes.StackFrameId, StackId>();
  const stacks: ThreadCpuStack[] = [];
  for (const hermesStackFunctionFrameId of hermesStacks) {
    const stackId = stacks.length;
    hermesStackToSentryStackMap.set(hermesStackFunctionFrameId, stackId);
    const stack: ThreadCpuStack = [];
    let currentHermesFrameId: Hermes.StackFrameId | undefined = hermesStackFunctionFrameId;
    while (currentHermesFrameId !== undefined) {
      const sentryFrameId = hermesStackFrameIdToSentryFrameIdMap.get(currentHermesFrameId);
      sentryFrameId !== undefined && stack.push(sentryFrameId);
      currentHermesFrameId = hermesStackFrames[currentHermesFrameId] && hermesStackFrames[currentHermesFrameId].parent;
    }
    stacks.push(stack);
  }

  return {
    stacks,
    hermesStackToSentryStackMap,
  };
}

/**
 * Parses Hermes StackFrame to Sentry StackFrame.
 * For native frames only function name is returned, for Hermes bytecode the line and column are calculated.
 */
export function parseHermesJSStackFrame(frame: Hermes.StackFrame): ThreadCpuFrame {
  if (frame.category !== 'JavaScript') {
    // Native
    if (frame.name === '[root]') {
      return { function: frame.name, in_app: false };
    }
    return { function: frame.name };
  }

  if (frame.funcVirtAddr !== undefined && frame.offset !== undefined) {
    // Hermes Bytecode
    return {
      function: frame.name,
      abs_path: DEFAULT_BUNDLE_NAME,
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
    function: indexOfLeftParenthesis !== -1 ? frame.name.substring(0, indexOfLeftParenthesis) || undefined : frame.name,
    abs_path: DEFAULT_BUNDLE_NAME,
    lineno: frame.line !== undefined ? Number(frame.line) : undefined,
    colno: frame.column !== undefined ? Number(frame.column) : undefined,
  };
}
