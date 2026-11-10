import type { ThreadCpuProfile } from '@sentry/core';

interface FlamegraphNode {
  frame_id: number;
  sample_count: number;
  children: number[];
}

interface FlamegraphTree {
  roots: number[];
  thread_id: string;
  thread_attributed?: boolean;
}

/** Converts leaf-first profiling stacks into independent, caller-first call trees. */
export function createHangFlamegraph(profile: ThreadCpuProfile, activeThreadId: string) {
  const nodes: FlamegraphNode[] = [];
  const trees = new Map<string, FlamegraphTree>();
  const paths = new Map<number[], Map<number, number>>();

  for (const sample of profile.samples) {
    const stack = profile.stacks[sample.stack_id];
    if (!stack.length) {
      continue;
    }
    let tree = trees.get(sample.thread_id);
    if (!tree) {
      tree = {
        roots: [],
        thread_id: sample.thread_id,
        ...(sample.thread_id === activeThreadId ? { thread_attributed: true } : {}),
      };
      trees.set(sample.thread_id, tree);
    }
    let siblings = tree.roots;
    for (let i = stack.length - 1; i >= 0; i--) {
      const frameId = stack[i];
      let indices = paths.get(siblings);
      if (!indices) {
        indices = new Map();
        paths.set(siblings, indices);
      }
      let nodeId = indices.get(frameId);
      if (nodeId === undefined) {
        nodeId = nodes.length;
        nodes.push({ frame_id: frameId, sample_count: 0, children: [] });
        siblings.push(nodeId);
        indices.set(frameId, nodeId);
      }
      const node = nodes[nodeId];
      node.sample_count++;
      siblings = node.children;
    }
  }

  return nodes.length
    ? {
        version: '1' as const,
        platform: 'javascript' as const,
        // Flame graph validation requires filename, function, or instruction_addr.
        // Anonymous Hermes frames can carry only abs_path and source coordinates.
        frames: profile.frames.map(frame =>
          frame.filename == null && frame.abs_path ? { ...frame, filename: frame.abs_path } : frame,
        ),
        nodes,
        trees: [...trees.values()],
      }
    : null;
}
