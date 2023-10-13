import type { DebugImage, Envelope, Event, Profile } from '@sentry/types';
import { forEachEnvelopeItem, GLOBAL_OBJ, logger } from '@sentry/utils';

import { DEFAULT_BUNDLE_NAME } from './hermes';
import type { RawThreadCpuProfile } from './types';

/**
 *
 */
export function isValidProfile(profile: RawThreadCpuProfile): profile is RawThreadCpuProfile & { profile_id: string } {
  if (profile.samples.length <= 1) {
    if (__DEV__) {
      // Log a warning if the profile has less than 2 samples so users can know why
      // they are not seeing any profiling data and we cant avoid the back and forth
      // of asking them to provide us with a dump of the profile data.
      logger.log('[Profiling] Discarding profile because it contains less than 2 samples');
    }
    return false;
  }

  if (!profile.profile_id) {
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
export function createProfilingEvent(profile: RawThreadCpuProfile, event: Event): Profile | null {
  if (!isValidProfile(profile)) {
    return null;
  }

  return createProfilePayload(profile, {
    release: event.release || '',
    environment: event.environment || '',
    event_id: event.event_id || '',
    transaction: event.transaction || '',
    start_timestamp: event.start_timestamp ? event.start_timestamp * 1000 : Date.now(),
    trace_id: (event?.contexts?.trace?.trace_id as string) ?? '',
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    profile_id: profile.profile_id,
    os_platform: event.contexts?.os?.name || '',
    os_version: event.contexts?.os?.version || '',
    os_build: event.contexts?.os?.build || '',
    device_locale: (event.contexts?.device?.locale as string) || '',
    device_model: event.contexts?.device?.model || '',
    device_manufacturer: event.contexts?.device?.manufacturer || '',
    device_architecture: event.contexts?.device?.arch || '',
    device_is_emulator: event.contexts?.device?.simulator || false,
  });
}

/**
 * Create a profile
 * @param profile
 * @param options
 * @returns
 */
function createProfilePayload(
  cpuProfile: RawThreadCpuProfile,
  {
    release,
    environment,
    event_id,
    transaction,
    start_timestamp,
    trace_id,
    profile_id,
    os_platform,
    os_version,
    os_build,
    device_locale,
    device_model,
    device_manufacturer,
    device_architecture,
    device_is_emulator,
  }: {
    release: string;
    environment: string;
    event_id: string;
    transaction: string;
    start_timestamp: number;
    trace_id: string | undefined;
    profile_id: string;
    os_platform: string;
    os_version: string;
    os_build?: string;
    device_locale: string;
    device_model: string;
    device_manufacturer: string;
    device_architecture: string;
    device_is_emulator: boolean;
  },
): Profile {
  // Log a warning if the profile has an invalid traceId (should be uuidv4).
  // All profiles and transactions are rejected if this is the case and we want to
  // warn users that this is happening if they enable debug flag
  if (trace_id && trace_id.length !== 32) {
    if (__DEV__) {
      logger.log(`[Profiling] Invalid traceId: ${trace_id} on profiled event`);
    }
  }

  const profile: Profile = {
    event_id: profile_id,
    timestamp: new Date(start_timestamp).toISOString(),
    platform: 'node',
    version: '1',
    release: release,
    environment: environment,
    runtime: {
      name: 'hermes',
      version: '', // TODO: get hermes version
    },
    os: {
      name: os_platform,
      version: os_version,
      build_number: os_build,
    },
    device: {
      locale: device_locale,
      model: device_model,
      manufacturer: device_manufacturer,
      architecture: device_architecture,
      is_emulator: device_is_emulator,
    },
    profile: cpuProfile,
    transaction: {
      name: transaction,
      id: event_id,
      trace_id: trace_id || '',
      active_thread_id: cpuProfile.active_thread_id,
    },
    debug_meta: {
      images: getDebugMetadata(),
    },
  };

  return profile;
}

/**
 * Returns debug meta images of the loaded bundle.
 */
export function getDebugMetadata(): DebugImage[] {
  if (!DEFAULT_BUNDLE_NAME) {
    return [];
  }

  const debugIdMap = GLOBAL_OBJ._sentryDebugIds;
  if (!debugIdMap) {
    return [];
  }

  const debugIds = Object.values(debugIdMap);
  if (!debugIds.length) {
    return [];
  }

  if (debugIds.length > 1) {
    logger.warn('[Profiling] Multiple debug images found, but only one one bundle is supported. Using the first one...');
  }

  return [{
    code_file: DEFAULT_BUNDLE_NAME,
    debug_id: debugIds[0],
    type: 'sourcemap',
  }];
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
