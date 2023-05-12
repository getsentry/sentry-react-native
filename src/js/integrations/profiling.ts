import type { EventProcessor, Hub, Integration } from '@sentry/types';

import type * as Hermes from '../utils/hermes';
import { NATIVE } from '../wrapper';

type ThreadId = string;
type FrameId = number;
type StackId = number;

interface Sample {
  stack_id: number;
  thread_id: ThreadId;
  elapsed_since_start_ns: string;
}

type Stack = FrameId[];

type Frame = {
  function: string;
  file?: string;
  line?: number;
  column?: number;
};

export interface ThreadCpuProfile {
  samples: Sample[];
  stacks: Stack[];
  frames: Frame[];
  thread_metadata: Record<ThreadId, { name?: string; priority?: number }>;
}

const UNKNOWN_FRAME_FUNCTION_NAME = '<unknown>';
const UNKNOWN_STACK_ID = -1;
const JS_THREAD_NAME = 'JavaScriptThread';
const JS_THREAD_PRIORITY = 1;

/**
 *
 */
export class ProfilingIntegration implements Integration {

  private _profileStartTimestampNs: number | undefined;

  /**
   * @inheritDoc
   */
  public static id: string = 'ProfilingIntegration';

  /**
   * @inheritDoc
   */
  public name: string = ProfilingIntegration.id;

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (e: EventProcessor) => void, getCurrentHub: () => Hub): void {
    // TODO:
  }
}

/**
 *
 */
async function startProfiling(): Promise<{ profileStartTimestampNs: number }> {
  const startTimestampNs = Date.now() * 10e6; // TODO: use timestamp from native for more accuracy
  await NATIVE.startProfiling();
  return { profileStartTimestampNs: startTimestampNs };
}

async function stopProfiling(profileStartTimestampNs: number): Promise<ThreadCpuProfile> {
  const uptimeTimestampNs = await NATIVE.getUptimeTimestampNs();
  const hermesProfile = await NATIVE.stopProfiling();
  return convertToSentryProfile(hermesProfile, { uptimeTimestampNs, profileStartTimestampNs });
}

/**
 *
 */
export function convertToSentryProfile(
  hermesProfile: Hermes.Profile,
  {
    uptimeTimestampNs,
    profileStartTimestampNs,
  }: {
    uptimeTimestampNs: number,
    profileStartTimestampNs: number,
  },
): ThreadCpuProfile {
  const jsThreads = new Set<ThreadId>();
  const hermesStacks = new Set<Hermes.StackFrameId>();

  const relativeProfileStart = Math.round(profileStartTimestampNs - uptimeTimestampNs);
  const samples = hermesProfile.samples.map((hermesSample: Hermes.Sample): Sample => {
    jsThreads.add(hermesSample.tid);
    hermesStacks.add(hermesSample.sf);

    const elapsed_since_start_ns = relativeProfileStart - Number(`${hermesSample.ts}000`);
    return {
      stack_id: hermesSample.sf,
      thread_id: hermesSample.tid,
      elapsed_since_start_ns: elapsed_since_start_ns.toString(),
    };
  });

  const hermesFrameChildMap = new Map<Hermes.StackFrameId, Hermes.StackFrameId>();
  const framesMap = new Map<string, Frame>();
  for (const key in hermesProfile.stackFrames) {
    if (!Object.prototype.hasOwnProperty.call(hermesProfile.stackFrames, key)) {
      continue;
    }
    const hermesFrame = hermesProfile.stackFrames[key];

    if (hermesFrame.parent !== undefined) {
      hermesFrameChildMap.set(Number(key), hermesFrame.parent);
    }

    const stackFrameName = parseHermesStackFrameName(hermesFrame.name);
    framesMap.set(key, {
      function: stackFrameName.function || UNKNOWN_FRAME_FUNCTION_NAME,
      file: stackFrameName.fileName,
      line: hermesFrame.line !== undefined ? Number(hermesFrame.line) : undefined,
      column: hermesFrame.column !== undefined ? Number(hermesFrame.column): undefined,
    });
  }

  const hermesStackRootToSentryStackMap = new Map<Hermes.StackFrameId, StackId>();
  const stacks: Stack[] = [];
  for (const hermesStackRootFrameId of hermesStacks) {
    const stackId = stacks.length;
    hermesStackRootToSentryStackMap.set(hermesStackRootFrameId, stackId);
    const stack: Stack = [];
    let currentHermesFrameId: Hermes.StackFrameId | undefined  = hermesStackRootFrameId;
    while (currentHermesFrameId !== undefined) {
      stack.push(currentHermesFrameId - 1); // Sentry frames are indexed from 0
      currentHermesFrameId = hermesFrameChildMap.get(currentHermesFrameId);
    }
    stacks.push(stack);
  }

  for (const sample of samples) {
    sample.stack_id = hermesStackRootToSentryStackMap.get(sample.stack_id) || UNKNOWN_STACK_ID;
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
    frames: Array.from(framesMap.values()), // TODO: ensure sorted by frame id
    stacks,
    thread_metadata,
  };
}

type HermesStackFrameNameParsed = {
  function?: string;
  fileName?: string;
};
const fileNameRegex = /([a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+):(\d+:\d+)\)$/;
/**
 *
 */
export function parseHermesStackFrameName(name: string): HermesStackFrameNameParsed {
  const result: HermesStackFrameNameParsed = {};
  const match = fileNameRegex.exec(name);
  if (match) {
    result.fileName = match[1];
  }
  result.function = name.split('(')[0]
  return result;
}
