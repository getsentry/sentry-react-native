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
import { dropUndefinedKeys, logger, uuid4 } from '@sentry/utils';

import { isHermesEnabled } from '../utils/environment';
import { NATIVE } from '../wrapper';
import { PROFILE_QUEUE } from './cache';
import { convertToSentryProfile } from './convertHermesProfile';
import {
  addProfilesToEnvelope,
  createProfilingEvent,
  enrichProfileWithEventContext,
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

    profile.event_id = this._currentProfile.profile_id;

    PROFILE_QUEUE.add(profile.event_id, profile);
    logger.log('[Profiling] finished profiling: ', profile.event_id);
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

    const profileWithEvent = enrichProfileWithEventContext(profile, profiledTransaction);
    logger.log(`[Profiling] Created profile ${profile_id} for transaction ${profiledTransaction.event_id}`);
    // TODO: Fix profiles so Partial<Profile> is not needed or validate full profile
    return profileWithEvent as unknown as Profile;
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

  const profileStartTimestampNs = Date.now() * MS_TO_NS;
  return profileStartTimestampNs;
}

/**
 * Stops Profilers and returns merged profile.
 */
export function stopProfiling(): Partial<Profile> | null {
  const result = NATIVE.stopProfiling();
  if (!result) {
    return null;
  }

  const hermesProfile = convertToSentryProfile(result.profile);
  if (!hermesProfile) {
    return null;
  }

  const profileEvent = createProfilingEvent(hermesProfile);
  if (!profileEvent) {
    return null;
  }

  const mergedProfile = mergeProfiles(
    profileEvent,
    // TODO: remove when JS types are updated with macho debug image
    // result.nativeProfile as unknown as Profile,
    {},
  );

  return mergedProfile;
}

type ProfileWithValueOrUndefined = {
  [P in keyof Profile]: Profile[P] | undefined;
};
function mergeProfiles(main: Partial<Profile>, add: Partial<Profile>): Partial<Profile> | null {
  const merged: ProfileWithValueOrUndefined = {
    device: main.device || add.device,
    environment: main.environment || add.environment,
    event_id: main.event_id || add.event_id,
    os: main.os || add.os,
    platform: main.platform || add.platform,
    release: main.release || add.release,
    runtime: main.runtime || add.runtime,
    timestamp: main.timestamp || add.timestamp,
    version: main.version || add.version,
    profile:
      main.profile && add.profile ? mergeThreadCpuProfile(main.profile, add.profile) : main.profile || add.profile,
  };

  if (add.debug_meta) {
    merged.debug_meta = main.debug_meta || { images: [] };
    merged.debug_meta.images = [...add.debug_meta.images, ...merged.debug_meta.images];
  }

  if (add.measurements) {
    merged.measurements = {
      ...add.measurements,
      ...main.measurements,
    };
  }

  const transactions: (Required<Profile>['transaction'] | Required<Profile>['transactions'][0])[] = [];
  if (main.transaction) {
    transactions.push(main.transaction);
  }
  if (add.transaction) {
    transactions.push(add.transaction);
  }
  if (main.transactions) {
    transactions.push(...main.transactions);
  }
  if (add.transactions) {
    transactions.push(...add.transactions);
  }

  if (transactions.length === 1) {
    merged.transaction = transactions[0];
  }

  return dropUndefinedKeys(merged);
}

function mergeThreadCpuProfile(main: ThreadCpuProfile, add: ThreadCpuProfile): ThreadCpuProfile {
  main.samples = [...main.samples, ...add.samples];
  // assumes thread ids are unique
  main.thread_metadata = { ...main.thread_metadata, ...add.thread_metadata };
  // assumes queue ids are unique
  main.queue_metadata = { ...main.queue_metadata, ...add.queue_metadata };

  // recalculate frames using offset
  const framesOffset = main.frames.length;
  main.frames = [...main.frames, ...add.frames];
  main.stacks = [...main.stacks, ...add.stacks.map(stack => stack.map(frameId => frameId + framesOffset))];

  return main;
}
