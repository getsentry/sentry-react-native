/* eslint-disable complexity */
import { convertIntegrationFnToClass, getActiveTransaction, getClient, getCurrentHub } from '@sentry/core';
import type {
  Envelope,
  Event,
  Integration,
  IntegrationClass,
  IntegrationFnResult,
  ThreadCpuProfile,
  Transaction,
} from '@sentry/types';
import { logger, uuid4 } from '@sentry/utils';
import { Platform } from 'react-native';

import type { ReactNativeClient } from '../client';
import { isHermesEnabled } from '../utils/environment';
import { NATIVE } from '../wrapper';
import { PROFILE_QUEUE } from './cache';
import { MAX_PROFILE_DURATION_MS } from './constants';
import { convertToSentryProfile } from './convertHermesProfile';
import type { NativeAndroidProfileEvent, NativeProfileEvent } from './nativeTypes';
import type { AndroidCombinedProfileEvent, CombinedProfileEvent, HermesProfileEvent, ProfileEvent } from './types';
import {
  addProfilesToEnvelope,
  createHermesProfilingEvent,
  enrichCombinedProfileWithEventContext,
  findProfiledTransactionsFromEnvelope,
} from './utils';

const INTEGRATION_NAME = 'HermesProfiling';

const MS_TO_NS: number = 1e6;

export interface HermesProfilingOptions {
  /**
   * Enable or disable profiling of native (iOS and Android) threads
   *
   * @default true
   */
  platformProfilers?: boolean;
}

const defaultOptions: Required<HermesProfilingOptions> = {
  platformProfilers: true,
};

/**
 * Profiling integration creates a profile for each transaction and adds it to the event envelope.
 *
 * @experimental
 */
export const hermesProfilingIntegration = (
  initOptions: HermesProfilingOptions = defaultOptions,
): IntegrationFnResult => {
  let _currentProfile:
    | {
        profile_id: string;
        startTimestampNs: number;
      }
    | undefined;
  let _currentProfileTimeout: number | undefined;
  const usePlatformProfilers = initOptions.platformProfilers ?? true;

  const setupOnce = (): void => {
    if (!isHermesEnabled()) {
      logger.log('[Profiling] Hermes is not enabled, not adding profiling integration.');
      return;
    }

    const client = getClient();

    if (!client || typeof client.on !== 'function') {
      return;
    }

    _startCurrentProfileForActiveTransaction();
    client.on('startTransaction', _startCurrentProfile);

    client.on('finishTransaction', _finishCurrentProfile);

    client.on('beforeEnvelope', (envelope: Envelope) => {
      if (!PROFILE_QUEUE.size()) {
        return;
      }

      const profiledTransactions = findProfiledTransactionsFromEnvelope(envelope);
      if (!profiledTransactions.length) {
        logger.log('[Profiling] no profiled transactions found in envelope');
        return;
      }

      const profilesToAddToEnvelope: ProfileEvent[] = [];
      for (const profiledTransaction of profiledTransactions) {
        const profile = _createProfileEventFor(profiledTransaction);
        if (profile) {
          profilesToAddToEnvelope.push(profile);
        }
      }
      addProfilesToEnvelope(envelope, profilesToAddToEnvelope);
    });
  };

  const _startCurrentProfileForActiveTransaction = (): void => {
    if (_currentProfile) {
      return;
    }
    const transaction = getActiveTransaction(getCurrentHub());
    transaction && _startCurrentProfile(transaction);
  };

  const _startCurrentProfile = (transaction: Transaction): void => {
    _finishCurrentProfile();

    const shouldStartProfiling = _shouldStartProfiling(transaction);
    if (!shouldStartProfiling) {
      return;
    }

    _currentProfileTimeout = setTimeout(_finishCurrentProfile, MAX_PROFILE_DURATION_MS);
    _startNewProfile(transaction);
  };

  const _shouldStartProfiling = (transaction: Transaction): boolean => {
    if (!transaction.sampled) {
      logger.log('[Profiling] Transaction is not sampled, skipping profiling');
      return false;
    }

    const client = getClient<ReactNativeClient>();
    const options = client && client.getOptions();

    const profilesSampleRate =
      options &&
      ((typeof options.profilesSampleRate === 'number' && options.profilesSampleRate) ||
        (options._experiments &&
          typeof options._experiments.profilesSampleRate === 'number' &&
          options._experiments.profilesSampleRate) ||
        undefined);
    if (profilesSampleRate === undefined) {
      logger.log('[Profiling] Profiling disabled, enable it by setting `profilesSampleRate` option to SDK init call.');
      return false;
    }

    // Check if we should sample this profile
    if (Math.random() > profilesSampleRate) {
      logger.log('[Profiling] Skip profiling transaction due to sampling.');
      return false;
    }

    return true;
  };

  /**
   * Starts a new profile and links it to the transaction.
   */
  const _startNewProfile = (transaction: Transaction): void => {
    const profileStartTimestampNs = startProfiling(usePlatformProfilers);
    if (!profileStartTimestampNs) {
      return;
    }

    _currentProfile = {
      profile_id: uuid4(),
      startTimestampNs: profileStartTimestampNs,
    };
    transaction.setContext('profile', { profile_id: _currentProfile.profile_id });
    // @ts-expect-error profile_id is not part of the metadata type
    transaction.setMetadata({ profile_id: _currentProfile.profile_id });
    logger.log('[Profiling] started profiling: ', _currentProfile.profile_id);
  };

  /**
   * Stops profiling and adds the profile to the queue to be processed on beforeEnvelope.
   */
  const _finishCurrentProfile = (): void => {
    _clearCurrentProfileTimeout();
    if (_currentProfile === undefined) {
      return;
    }

    const profile = stopProfiling(_currentProfile.startTimestampNs);
    if (!profile) {
      logger.warn('[Profiling] Stop failed. Cleaning up...');
      _currentProfile = undefined;
      return;
    }

    PROFILE_QUEUE.add(_currentProfile.profile_id, profile);

    logger.log('[Profiling] finished profiling: ', _currentProfile.profile_id);
    _currentProfile = undefined;
  };

  const _createProfileEventFor = (profiledTransaction: Event): ProfileEvent | null => {
    const profile_id = profiledTransaction?.contexts?.['profile']?.['profile_id'];

    if (typeof profile_id !== 'string') {
      logger.log('[Profiling] cannot find profile for a transaction without a profile context');
      return null;
    }

    // Remove the profile from the transaction context before sending, relay will take care of the rest.
    if (profiledTransaction?.contexts?.['.profile']) {
      delete profiledTransaction.contexts.profile;
    }

    const profile = PROFILE_QUEUE.get(profile_id);
    PROFILE_QUEUE.delete(profile_id);

    if (!profile) {
      logger.log(`[Profiling] cannot find profile ${profile_id} for transaction ${profiledTransaction.event_id}`);
      return null;
    }

    const profileWithEvent = enrichCombinedProfileWithEventContext(profile_id, profile, profiledTransaction);
    logger.log(`[Profiling] Created profile ${profile_id} for transaction ${profiledTransaction.event_id}`);

    return profileWithEvent;
  };

  const _clearCurrentProfileTimeout = (): void => {
    _currentProfileTimeout !== undefined && clearTimeout(_currentProfileTimeout);
    _currentProfileTimeout = undefined;
  };

  return {
    name: INTEGRATION_NAME,
    setupOnce,
  };
};

/**
 * Profiling integration creates a profile for each transaction and adds it to the event envelope.
 *
 * @deprecated Use `hermesProfilingIntegration()` instead.
 */
// eslint-disable-next-line deprecation/deprecation
export const HermesProfiling = convertIntegrationFnToClass(
  INTEGRATION_NAME,
  hermesProfilingIntegration,
) as IntegrationClass<Integration>;

/**
 * Starts Profilers and returns the timestamp when profiling started in nanoseconds.
 */
export function startProfiling(platformProfilers: boolean): number | null {
  const started = NATIVE.startProfiling(platformProfilers);
  if (!started) {
    return null;
  }

  return Date.now() * MS_TO_NS;
}

/**
 * Stops Profilers and returns collected combined profile.
 */
export function stopProfiling(
  profileStartTimestampNs: number,
): CombinedProfileEvent | AndroidCombinedProfileEvent | null {
  const collectedProfiles = NATIVE.stopProfiling();
  if (!collectedProfiles) {
    return null;
  }
  const profileEndTimestampNs = Date.now() * MS_TO_NS;

  const hermesProfile = convertToSentryProfile(collectedProfiles.hermesProfile);
  if (!hermesProfile) {
    return null;
  }

  const hermesProfileEvent = createHermesProfilingEvent(hermesProfile);
  if (!hermesProfileEvent) {
    return null;
  }

  if (collectedProfiles.androidProfile) {
    const durationNs = profileEndTimestampNs - profileStartTimestampNs;
    return createAndroidWithHermesProfile(hermesProfileEvent, collectedProfiles.androidProfile, durationNs);
  } else if (collectedProfiles.nativeProfile) {
    return addNativeProfileToHermesProfile(hermesProfileEvent, collectedProfiles.nativeProfile);
  }

  return hermesProfileEvent;
}

/**
 * Creates Android profile event with attached javascript profile.
 */
export function createAndroidWithHermesProfile(
  hermes: HermesProfileEvent,
  nativeAndroid: NativeAndroidProfileEvent,
  durationNs: number,
): AndroidCombinedProfileEvent {
  return {
    ...nativeAndroid,
    platform: 'android',
    js_profile: hermes.profile,
    duration_ns: durationNs.toString(10),
    active_thread_id: hermes.transaction.active_thread_id,
  };
}

/**
 * Merges Hermes and Native profile events into one.
 */
export function addNativeProfileToHermesProfile(
  hermes: HermesProfileEvent,
  native: NativeProfileEvent,
): CombinedProfileEvent {
  return {
    ...hermes,
    profile: addNativeThreadCpuProfileToHermes(hermes.profile, native.profile, hermes.transaction.active_thread_id),
    debug_meta: {
      images: native.debug_meta.images,
    },
    measurements: native.measurements,
  };
}

/**
 * Merges Hermes And Native profiles into one.
 */
export function addNativeThreadCpuProfileToHermes(
  hermes: ThreadCpuProfile,
  native: ThreadCpuProfile,
  hermes_active_thread_id: string | undefined,
): CombinedProfileEvent['profile'] {
  // assumes thread ids are unique
  hermes.thread_metadata = { ...native.thread_metadata, ...hermes.thread_metadata };
  // assumes queue ids are unique
  hermes.queue_metadata = { ...native.queue_metadata, ...hermes.queue_metadata };

  // recalculate frames and stacks using offset
  const framesOffset = hermes.frames.length;
  const stacksOffset = hermes.stacks.length;

  if (native.frames) {
    for (const frame of native.frames) {
      hermes.frames.push({
        function: frame.function,
        instruction_addr: frame.instruction_addr,
        platform: Platform.OS === 'ios' ? 'cocoa' : undefined,
      });
    }
  }
  hermes.stacks = [
    ...(hermes.stacks || []),
    ...(native.stacks || []).map(stack => stack.map(frameId => frameId + framesOffset)),
  ];
  hermes.samples = [
    ...(hermes.samples || []),
    ...(native.samples || [])
      .filter(sample => sample.thread_id !== hermes_active_thread_id)
      .map(sample => ({
        ...sample,
        stack_id: stacksOffset + sample.stack_id,
      })),
  ];

  return hermes;
}
