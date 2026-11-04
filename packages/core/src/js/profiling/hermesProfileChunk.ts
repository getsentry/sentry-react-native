import type { Client, ProfileChunk } from '@sentry/core';

import { uuid4 } from '@sentry/core';

import type * as Hermes from './hermes';

import { getDefaultEnvironment } from '../utils/environment';
import { convertToSentryProfile } from './convertHermesProfile';
import { getDebugMetadata } from './debugid';

/**
 * Thread id of the Hermes samples in a profile chunk.
 *
 * The native profiler also samples the JS thread under its OS thread id. Sentry merges all chunks of
 * a profiler id, so the Hermes samples need their own id. Linux thread ids stay below 2^22.
 */
export const HERMES_CHUNK_THREAD_ID = String(2 ** 32);

/** Relay rejects profile chunks that are longer than 66 seconds. */
const MAX_CHUNK_DURATION_NS = 66e9;

/**
 * Converts a Hermes profile to a profile chunk for the native profiler session `profilerId`.
 *
 * Hermes timestamps use a monotonic clock, so the samples are placed relative to
 * `startTimestampMs`, the Unix time when the Hermes sampler started.
 */
export function createHermesProfileChunk(
  hermesProfile: Hermes.Profile,
  startTimestampMs: number,
  profilerId: string,
  client: Client,
): ProfileChunk | null {
  const profile = convertToSentryProfile(hermesProfile, MAX_CHUNK_DURATION_NS);
  if (!profile) {
    return null;
  }

  const options = client.getOptions();
  const sdk = client.getSdkMetadata()?.sdk;
  return {
    chunk_id: uuid4(),
    profiler_id: profilerId,
    client_sdk: { name: sdk?.name ?? '', version: sdk?.version ?? '' },
    platform: 'javascript',
    version: '2',
    release: options.release ?? '',
    environment: options.environment ?? getDefaultEnvironment(),
    debug_meta: { images: getDebugMetadata() },
    profile: {
      frames: profile.frames,
      stacks: profile.stacks,
      samples: profile.samples.map(sample => ({
        stack_id: sample.stack_id,
        thread_id: HERMES_CHUNK_THREAD_ID,
        timestamp: startTimestampMs / 1e3 + Number(sample.elapsed_since_start_ns) / 1e9,
      })),
      thread_metadata: { [HERMES_CHUNK_THREAD_ID]: profile.thread_metadata[profile.active_thread_id] ?? {} },
    },
  };
}
