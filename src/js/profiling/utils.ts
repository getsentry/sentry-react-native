/* eslint-disable complexity */
import type { Envelope, Event, Profile, ThreadCpuProfile } from '@sentry/types';
import { forEachEnvelopeItem, logger } from '@sentry/utils';

import { getDefaultEnvironment } from '../utils/environment';
import { getDebugMetadata } from './debugid';
import type { CombinedProfileEvent, HermesProfileEvent, RawThreadCpuProfile } from './types';

/**
 *
 */
export function isValidProfile(profile: ThreadCpuProfile): profile is RawThreadCpuProfile & { profile_id: string } {
  if (profile.samples.length <= 1) {
    if (__DEV__) {
      // Log a warning if the profile has less than 2 samples so users can know why
      // they are not seeing any profiling data and we cant avoid the back and forth
      // of asking them to provide us with a dump of the profile data.
      logger.log('[Profiling] Discarding profile because it contains less than 2 samples');
    }
    return false;
  }
  return true;
}

/**
 * Finds transactions with profile_id context in the envelope
 * @param envelope
 * @returns
 */
export function findProfiledTransactionsFromEnvelope(envelope: Envelope): Event[] {
  const events: Event[] = [];

  forEachEnvelopeItem(envelope, (item, type) => {
    if (type !== 'transaction') {
      return;
    }

    // First item is the type
    for (let j = 1; j < item.length; j++) {
      const event = item[j];

      // @ts-expect-error accessing private property
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (event && event.contexts && event.contexts['profile'] && event.contexts['profile']['profile_id']) {
        events.push(item[j] as Event);
      }
    }
  });

  return events;
}

/**
 * Creates a profiling envelope item, if the profile does not pass validation, returns null.
 * @param event
 * @returns {Profile | null}
 */
export function enrichCombinedProfileWithEventContext(
  profile_id: string,
  profile: CombinedProfileEvent,
  event: Event,
): Profile | null {
  if (!profile.profile || !isValidProfile(profile.profile)) {
    return null;
  }

  const trace_id = (event.contexts && event.contexts.trace && event.contexts.trace.trace_id) || '';

  // Log a warning if the profile has an invalid traceId (should be uuidv4).
  // All profiles and transactions are rejected if this is the case and we want to
  // warn users that this is happening if they enable debug flag
  if (trace_id && trace_id.length !== 32) {
    if (__DEV__) {
      logger.log(`[Profiling] Invalid traceId: ${trace_id} on profiled event`);
    }
  }

  return {
    ...profile,
    event_id: profile_id,
    runtime: {
      name: 'hermes',
      version: '', // TODO: get hermes version
    },
    timestamp: event.start_timestamp ? new Date(event.start_timestamp * 1000).toISOString() : new Date().toISOString(),
    release: event.release || '',
    environment: event.environment || getDefaultEnvironment(),
    os: {
      name: (event.contexts && event.contexts.os && event.contexts.os.name) || '',
      version: (event.contexts && event.contexts.os && event.contexts.os.version) || '',
      build_number: (event.contexts && event.contexts.os && event.contexts.os.build) || '',
    },
    device: {
      locale: (event.contexts && event.contexts.device && (event.contexts.device.locale as string)) || '',
      model: (event.contexts && event.contexts.device && event.contexts.device.model) || '',
      manufacturer: (event.contexts && event.contexts.device && event.contexts.device.manufacturer) || '',
      architecture: (event.contexts && event.contexts.device && event.contexts.device.arch) || '',
      is_emulator: (event.contexts && event.contexts.device && event.contexts.device.simulator) || false,
    },
    transaction: {
      name: event.transaction || '',
      id: event.event_id || '',
      trace_id,
      active_thread_id: (profile.transaction && profile.transaction.active_thread_id) || '',
    },
    debug_meta: {
      images: [...getDebugMetadata(), ...((profile.debug_meta && profile.debug_meta.images) || [])],
    },
  };
}

/**
 * Creates profiling event compatible carrier Object from raw Hermes profile.
 */
export function createHermesProfilingEvent(profile: RawThreadCpuProfile): HermesProfileEvent {
  return {
    platform: 'javascript',
    version: '1',
    profile,
    transaction: {
      active_thread_id: profile.active_thread_id,
    },
  };
}

/**
 * Adds items to envelope if they are not already present - mutates the envelope.
 * @param envelope
 */
export function addProfilesToEnvelope(envelope: Envelope, profiles: Profile[]): Envelope {
  if (!profiles.length) {
    return envelope;
  }

  for (const profile of profiles) {
    // @ts-expect-error untyped envelope
    envelope[1].push([{ type: 'profile' }, profile]);
  }
  return envelope;
}
