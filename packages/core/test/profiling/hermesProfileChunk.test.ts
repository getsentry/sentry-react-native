import { createHermesProfileChunk, HERMES_CHUNK_THREAD_ID } from '../../src/js/profiling/hermesProfileChunk';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';
import { createMockMinimalValidHermesProfile } from './fixtures';

describe('createHermesProfileChunk', () => {
  it('creates a JavaScript profile chunk for the profiler id', () => {
    const client = new TestClient(getDefaultTestClientOptions({ release: 'app@1.0.0', environment: 'staging' }));

    const chunk = createHermesProfileChunk(
      createMockMinimalValidHermesProfile(),
      1_700_000_000_000,
      '0123456789abcdef0123456789abcdef',
      client,
    );

    expect(chunk).toMatchObject({
      chunk_id: expect.stringMatching(/^[0-9a-f]{32}$/),
      profiler_id: '0123456789abcdef0123456789abcdef',
      platform: 'javascript',
      version: '2',
      release: 'app@1.0.0',
      environment: 'staging',
      profile: {
        frames: [{ function: '[root]', in_app: false }],
        stacks: [[0]],
        thread_metadata: { [HERMES_CHUNK_THREAD_ID]: { name: 'JavaScriptThread', priority: 1 } },
      },
    });
  });

  it('places the samples after the start timestamp on the Hermes chunk thread', () => {
    const client = new TestClient(getDefaultTestClientOptions());

    const chunk = createHermesProfileChunk(
      createMockMinimalValidHermesProfile(),
      1_700_000_000_000,
      '0123456789abcdef0123456789abcdef',
      client,
    );

    expect(chunk?.profile.samples).toEqual([
      { stack_id: 0, thread_id: HERMES_CHUNK_THREAD_ID, timestamp: 1_700_000_000 },
      { stack_id: 0, thread_id: HERMES_CHUNK_THREAD_ID, timestamp: 1_700_000_000.00001 },
    ]);
  });

  it('keeps samples after the transaction profile duration limit', () => {
    const client = new TestClient(getDefaultTestClientOptions());
    const hermesProfile = createMockMinimalValidHermesProfile();
    hermesProfile.samples[1]!.ts = '45000010';

    const chunk = createHermesProfileChunk(
      hermesProfile,
      1_700_000_000_000,
      '0123456789abcdef0123456789abcdef',
      client,
    );

    expect(chunk?.profile.samples[1]?.timestamp).toBe(1_700_000_045);
  });

  it('returns null for a profile without samples', () => {
    const client = new TestClient(getDefaultTestClientOptions());

    const chunk = createHermesProfileChunk(
      { samples: [], stackFrames: {}, traceEvents: [] },
      1_700_000_000_000,
      '0123456789abcdef0123456789abcdef',
      client,
    );

    expect(chunk).toBeNull();
  });
});
