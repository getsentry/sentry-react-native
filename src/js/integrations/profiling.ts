import type { EventProcessor, Integration } from '@sentry/types';

interface Sample {
  stack_id: number;
  thread_id: string;
  elapsed_since_start_ns: string;
}

type Stack = number[];

type Frame = {
  function: string;
  file: string;
  line: number;
  column: number;
};

interface ThreadCpuProfile {
  samples: Sample[];
  stacks: Stack[];
  frames: Frame[];
  thread_metadata: Record<string, { name?: string; priority?: number }>;
  queue_metadata?: Record<string, { label: string }>;
}

/**
 *
 */
export class ProfilingIntegration implements Integration {

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
export async function startProfiling(): Promise<void> {
  // TODO:
}

/**
 *
 */
export async function stopProfiling(): Promise<ThreadCpuProfile> {
  // TODO:
  throw new Error('not implemented');
}

function toUnixTimestampNs(uptimeTimestampNs: number, relativeTimestampNs: number): number {
  return uptimeTimestampNs + relativeTimestampNs;
}
