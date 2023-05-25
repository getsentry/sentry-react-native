import type * as Hermes from './hermes';
import { parseHermesStackFrameName } from './hermes';
import type { Frame, Sample, Stack, StackId, ThreadCpuProfile, ThreadId } from './types';

const UNKNOWN_FRAME_FUNCTION_NAME = '<unknown>';
const UNKNOWN_STACK_ID = -1;
const JS_THREAD_NAME = 'JavaScriptThread';
const JS_THREAD_PRIORITY = 1;

/**
 *
 */
export function convertToSentryProfile(hermesProfile: Hermes.Profile): ThreadCpuProfile {
  const jsThreads = new Set<ThreadId>();
  const hermesStacks = new Set<Hermes.StackFrameId>();

  if (hermesProfile.samples.length === 0) {
    throw new Error('Empty profile');
    // TODO: handle empty profile
  }

  const start = Number(hermesProfile.samples[0].ts);
  const samples = hermesProfile.samples.map((hermesSample: Hermes.Sample): Sample => {
    jsThreads.add(hermesSample.tid);
    hermesStacks.add(hermesSample.sf);

    const elapsed_since_start_ns = (Number(hermesSample.ts) - start) * 1e3;

    return {
      stack_id: hermesSample.sf,
      thread_id: hermesSample.tid,
      elapsed_since_start_ns: elapsed_since_start_ns.toFixed(0),
    };
  });

  const hermesFrameChildToParentMap = new Map<Hermes.StackFrameId, Hermes.StackFrameId>();
  const framesMap = new Map<string, Frame>();
  for (const key in hermesProfile.stackFrames) {
    if (!Object.prototype.hasOwnProperty.call(hermesProfile.stackFrames, key)) {
      continue;
    }
    const hermesFrame = hermesProfile.stackFrames[key];

    if (hermesFrame.parent !== undefined) {
      hermesFrameChildToParentMap.set(Number(key), hermesFrame.parent);
    }

    const stackFrameName = parseHermesStackFrameName(hermesFrame.name);
    framesMap.set(key, {
      function: stackFrameName.function || UNKNOWN_FRAME_FUNCTION_NAME,
      file: stackFrameName.fileName,
      line: hermesFrame.line !== undefined ? Number(hermesFrame.line) : undefined,
      column: hermesFrame.column !== undefined ? Number(hermesFrame.column) : undefined,
    });
  }

  const hermesStackToSentryStackMap = new Map<Hermes.StackFrameId, StackId>();
  const stacks: Stack[] = [];
  for (const hermesStackFunctionFrameId of hermesStacks) {
    const stackId = stacks.length;
    hermesStackToSentryStackMap.set(hermesStackFunctionFrameId, stackId);
    const stack: Stack = [];
    let currentHermesFrameId: Hermes.StackFrameId | undefined = hermesStackFunctionFrameId;
    while (currentHermesFrameId !== undefined) {
      stack.push(currentHermesFrameId - 1); // Sentry frames are indexed from 0
      currentHermesFrameId = hermesFrameChildToParentMap.get(currentHermesFrameId);
    }
    stacks.push(stack);
  }

  for (const sample of samples) {
    sample.stack_id = hermesStackToSentryStackMap.get(sample.stack_id) ?? UNKNOWN_STACK_ID;
  }

  const thread_metadata: Record<ThreadId, { name?: string; priority?: number }> = {};
  for (const jsThreadId of jsThreads) {
    thread_metadata[jsThreadId] = {
      name: JS_THREAD_NAME,
      priority: JS_THREAD_PRIORITY,
    };
  }

  return {
    samples,
    frames: Array.from(framesMap.entries())
      .sort(([aKey]: [string, Frame], [bKey]: [string, Frame]) => Number(aKey) - Number(bKey))
      .map(([_, frame]: [string, Frame]) => frame),
    stacks,
    thread_metadata,
  };
}
