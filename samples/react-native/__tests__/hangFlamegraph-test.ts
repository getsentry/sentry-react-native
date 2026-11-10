import { createHangFlamegraph } from '../src/hangFlamegraph';
import type { ThreadCpuProfile } from '@sentry/core';

const profile: ThreadCpuProfile = {
  frames: [{ function: 'root' }, { function: 'work' }, { function: 'other' }],
  stacks: [[1, 0], [0], [2, 0], [0, 0]],
  samples: [
    { stack_id: 0, thread_id: '7', elapsed_since_start_ns: '0' },
    { stack_id: 0, thread_id: '7', elapsed_since_start_ns: '1' },
    { stack_id: 1, thread_id: '7', elapsed_since_start_ns: '2' },
    { stack_id: 2, thread_id: '8', elapsed_since_start_ns: '3' },
    { stack_id: 3, thread_id: '7', elapsed_since_start_ns: '4' },
  ],
  thread_metadata: {},
};

describe('createHangFlamegraph', () => {
  it('aggregates inclusive counts by caller-to-callee path independently for each thread', () => {
    const graph = createHangFlamegraph(profile, '7');

    expect(graph).toEqual({
      version: '1',
      platform: 'javascript',
      frames: profile.frames,
      nodes: [
        { frame_id: 0, sample_count: 4, children: [1, 4] },
        { frame_id: 1, sample_count: 2, children: [] },
        { frame_id: 0, sample_count: 1, children: [3] },
        { frame_id: 2, sample_count: 1, children: [] },
        { frame_id: 0, sample_count: 1, children: [] },
      ],
      trees: [
        { roots: [0], thread_id: '7', thread_attributed: true },
        { roots: [2], thread_id: '8' },
      ],
    });
    expect(profile.stacks[0]).toEqual([1, 0]);
  });

  it('gives anonymous JS frames a filename without changing source locations or existing filenames', () => {
    const frames = [
      { abs_path: 'app:///main.jsbundle', lineno: 10208, colno: 119 },
      { filename: 'work.js', abs_path: 'app:///main.jsbundle', function: 'work', lineno: 42, colno: 7 },
      { instruction_addr: '0x1000', platform: 'cocoa' },
    ];

    const graph = createHangFlamegraph({ ...profile, frames }, '7');

    expect(graph?.frames).toEqual([
      { filename: 'app:///main.jsbundle', abs_path: 'app:///main.jsbundle', lineno: 10208, colno: 119 },
      frames[1],
      frames[2],
    ]);
    expect(graph?.frames.every(frame => frame.filename || frame.function || frame.instruction_addr)).toBe(true);
    expect(frames[0]).not.toHaveProperty('filename');
  });

  it('does not create an invalid attachment when there are no sampled stacks', () => {
    const graph = createHangFlamegraph({ ...profile, samples: [] }, '7');

    expect(graph).toBeNull();
  });
});
