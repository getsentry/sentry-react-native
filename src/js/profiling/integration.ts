/* eslint-disable complexity */
import type { Hub } from '@sentry/core';
import { getActiveTransaction } from '@sentry/core';
import type {
  Envelope,
  Event,
  EventProcessor,
  Integration,
  Profile,
  ThreadCpuProfile,
  Transaction,
} from '@sentry/types';
import { logger, uuid4 } from '@sentry/utils';
import { Platform } from 'react-native';

import { isHermesEnabled } from '../utils/environment';
import { NATIVE } from '../wrapper';
import { PROFILE_QUEUE } from './cache';
import { convertToSentryProfile } from './convertHermesProfile';
import type { NativeProfileEvent } from './nativeTypes';
import type { CombinedProfileEvent, HermesProfileEvent } from './types';
import {
  addProfilesToEnvelope,
  createHermesProfilingEvent,
  enrichCombinedProfileWithEventContext,
  findProfiledTransactionsFromEnvelope,
} from './utils';

export const MAX_PROFILE_DURATION_MS = 30 * 1e3;

const MS_TO_NS: number = 1e6;

/**
 * Profiling integration creates a profile for each transaction and adds it to the event envelope.
 *
 * @experimental
 */
export class HermesProfiling implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'HermesProfiling';

  /**
   * @inheritDoc
   */
  public name: string = HermesProfiling.id;

  private _getCurrentHub?: () => Hub;

  private _currentProfile:
    | {
        profile_id: string;
        startTimestampNs: number;
      }
    | undefined;

  private _currentProfileTimeout: number | undefined;

  /**
   * @inheritDoc
   */
  public setupOnce(_: (e: EventProcessor) => void, getCurrentHub: () => Hub): void {
    if (!isHermesEnabled()) {
      logger.log('[Profiling] Hermes is not enabled, not adding profiling integration.');
      return;
    }

    this._getCurrentHub = getCurrentHub;
    const client = getCurrentHub().getClient();

    if (!client || typeof client.on !== 'function') {
      return;
    }

    this._startCurrentProfileForActiveTransaction();
    client.on('startTransaction', this._startCurrentProfile);

    client.on('finishTransaction', this._finishCurrentProfile);

    client.on('beforeEnvelope', (envelope: Envelope) => {
      if (!PROFILE_QUEUE.size()) {
        return;
      }

      const profiledTransactions = findProfiledTransactionsFromEnvelope(envelope);
      if (!profiledTransactions.length) {
        logger.log('[Profiling] no profiled transactions found in envelope');
        return;
      }

      const profilesToAddToEnvelope: Profile[] = [];
      for (const profiledTransaction of profiledTransactions) {
        const profile = this._createProfileEventFor(profiledTransaction);
        if (profile) {
          profilesToAddToEnvelope.push(profile);
        }
      }
      addProfilesToEnvelope(envelope, profilesToAddToEnvelope);
    });
  }

  private _startCurrentProfileForActiveTransaction = (): void => {
    if (this._currentProfile) {
      return;
    }
    const transaction = this._getCurrentHub && getActiveTransaction(this._getCurrentHub());
    transaction && this._startCurrentProfile(transaction);
  };

  private _startCurrentProfile = (transaction: Transaction): void => {
    this._finishCurrentProfile();

    const shouldStartProfiling = this._shouldStartProfiling(transaction);
    if (!shouldStartProfiling) {
      return;
    }

    this._currentProfileTimeout = setTimeout(this._finishCurrentProfile, MAX_PROFILE_DURATION_MS);
    this._startNewProfile(transaction);
  };

  private _shouldStartProfiling = (transaction: Transaction): boolean => {
    if (!transaction.sampled) {
      logger.log('[Profiling] Transaction is not sampled, skipping profiling');
      return false;
    }

    const client = this._getCurrentHub && this._getCurrentHub().getClient();
    const options = client && client.getOptions();

    const profilesSampleRate =
      options && options._experiments && typeof options._experiments.profilesSampleRate === 'number'
        ? options._experiments.profilesSampleRate
        : undefined;
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
  private _startNewProfile = (transaction: Transaction): void => {
    const profileStartTimestampNs = startProfiling();
    if (!profileStartTimestampNs) {
      return;
    }

    this._currentProfile = {
      profile_id: uuid4(),
      startTimestampNs: profileStartTimestampNs,
    };
    transaction.setContext('profile', { profile_id: this._currentProfile.profile_id });
    // @ts-expect-error profile_id is not part of the metadata type
    transaction.setMetadata({ profile_id: this._currentProfile.profile_id });
    logger.log('[Profiling] started profiling: ', this._currentProfile.profile_id);
  };

  /**
   * Stops profiling and adds the profile to the queue to be processed on beforeEnvelope.
   */
  private _finishCurrentProfile = (): void => {
    this._clearCurrentProfileTimeout();
    if (this._currentProfile === undefined) {
      return;
    }

    const profile = stopProfiling();
    if (!profile) {
      logger.warn('[Profiling] Stop failed. Cleaning up...');
      this._currentProfile = undefined;
      return;
    }

    PROFILE_QUEUE.add(this._currentProfile.profile_id, profile);

    logger.log('[Profiling] finished profiling: ', this._currentProfile.profile_id);
    this._currentProfile = undefined;
  };

  private _createProfileEventFor = (profiledTransaction: Event): Profile | null => {
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

  private _clearCurrentProfileTimeout = (): void => {
    this._currentProfileTimeout !== undefined && clearTimeout(this._currentProfileTimeout);
    this._currentProfileTimeout = undefined;
  };
}

/**
 * Starts Profilers and returns the timestamp when profiling started in nanoseconds.
 */
export function startProfiling(): number | null {
  const started = NATIVE.startProfiling();
  if (!started) {
    return null;
  }

  return Date.now() * MS_TO_NS;
}

/**
 * Stops Profilers and returns collected combined profile.
 */
export function stopProfiling(): CombinedProfileEvent | null {
  const collectedProfiles = NATIVE.stopProfiling();
  if (!collectedProfiles) {
    return null;
  }

  const hermesProfile = convertToSentryProfile(collectedProfiles.hermesProfile);
  if (!hermesProfile) {
    return null;
  }

  const hermesProfileEvent = createHermesProfilingEvent(hermesProfile);
  if (!hermesProfileEvent) {
    return null;
  }

  if (!collectedProfiles.nativeProfile) {
    return hermesProfileEvent;
  }

  return addNativeProfileToHermesProfile(hermesProfileEvent, collectedProfiles.nativeProfile);
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
