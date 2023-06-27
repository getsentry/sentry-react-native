import type {
  Envelope,
  Event,
  EventProcessor,
  Hub,
  Integration,
  Profile,
  ThreadCpuProfile,
  Transaction,
} from '@sentry/types';
import { logger, uuid4 } from '@sentry/utils';

import { isHermesEnabled } from '../utils/environment';
import { PROFILE_QUEUE } from './cache';
import { startProfiling, stopProfiling } from './hermes';
import {
  addProfilesToEnvelope,
  createProfilingEvent,
  deepCloneThreadCpuProfile,
  findProfiledTransactionsFromEnvelope,
  mergeThreadCpuProfile,
} from './utils';

export const MAX_PROFILE_DURATION_MS = 30 * 1e6;

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

  private _currentProfilesCandidatesMap: Map<
    string,
    {
      profileId: string;
      startTimestampNs: number;
      timeout: number | undefined;
      partialProfiles: ThreadCpuProfile[];
    }
  > = new Map();

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

    client.on('startTransaction', (transaction: Transaction) => {
      const shouldStartProfiling = this._shouldStartProfiling(transaction);
      if (!shouldStartProfiling) {
        return;
      }

      this._createProfile(transaction);
    });

    client.on('finishTransaction', (transaction: Transaction) => {
      // @ts-expect-error profile_id is not part of the metadata type
      const profileId = transaction.metadata.profile_id;
      if (typeof profileId !== 'string') {
        return;
      }
      this._finishProfile(profileId);
    });

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

  private _shouldStartProfiling = (transaction: Transaction): boolean => {
    if (!transaction.sampled) {
      logger.log('[Profiling] Transaction is not sampled, skipping profiling');
      return false;
    }

    const client = this._getCurrentHub && this._getCurrentHub().getClient();
    const options = client && client.getOptions();

    // @ts-ignore not part of the browser options yet
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
  private _createProfile = (transaction: Transaction): void => {
    this._stopProfilerAndSavePartialProfile();
    const profileStartTimestampNs = this._startProfiler();

    const profileId = uuid4();
    const currentProfile = {
      profileId,
      startTimestampNs: profileStartTimestampNs,
      timeout: setTimeout(() => this._finishProfile(profileId), MAX_PROFILE_DURATION_MS),
      partialProfiles: [],
    };

    this._currentProfilesCandidatesMap.set(currentProfile.profileId, currentProfile);
    transaction.setContext('profile', { profile_id: currentProfile.profileId });
    // @ts-expect-error profile_id is not part of the metadata type
    transaction.setMetadata({ profile_id: currentProfile.profileId });
    logger.log('[Profiling] started profiling: ', currentProfile.profileId);
  };

  /**
   * Stops profiling and adds the profile to the queue to be processed on beforeEnvelope.
   */
  private _finishProfile = (profileId: string): void => {
    const candidate = this._currentProfilesCandidatesMap.get(profileId);
    if (!candidate) {
      return;
    }

    this._stopProfilerAndSavePartialProfile();
    this._currentProfilesCandidatesMap.delete(profileId);
    if (this._currentProfilesCandidatesMap.size > 0) {
      this._startProfiler();
    }

    candidate.timeout !== undefined && clearTimeout(candidate.timeout);
    candidate.timeout = undefined;

    if (candidate.partialProfiles.length === 0) {
      logger.warn('[Profiling] No partial profiles found for profile: ', profileId);
      return;
    }

    const profile = deepCloneThreadCpuProfile(candidate.partialProfiles[0]);
    for (let i = 1; i < candidate.partialProfiles.length; i++) {
      mergeThreadCpuProfile(profile, candidate.partialProfiles[i]);
    }
    profile.profile_id = profileId;
    PROFILE_QUEUE.add(profileId, profile);
    logger.log('[Profiling] finished profiling: ', profileId);
  };

  private _stopProfilerAndSavePartialProfile = (): void => {
    if (this._currentProfilesCandidatesMap.size === 0) {
      return;
    }

    const partial = stopProfiling();
    if (!partial) {
      logger.warn('[Profiling] Stop failed.');
      return;
    }

    this._currentProfilesCandidatesMap.forEach(candidate => {
      candidate.partialProfiles.push(partial);
    });
  };

  private _startProfiler = (): number | null => {
    const profileStartTimestampNs = startProfiling();
    profileStartTimestampNs === null && logger.warn('[Profiling] Start failed.');
    return profileStartTimestampNs;
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

    const cpuProfile = PROFILE_QUEUE.get(profile_id);
    PROFILE_QUEUE.delete(profile_id);

    if (!cpuProfile) {
      logger.log(`[Profiling] cannot find profile ${profile_id} for transaction ${profiledTransaction.event_id}`);
      return null;
    }

    const profile = createProfilingEvent(cpuProfile, profiledTransaction);
    logger.log(`[Profiling] Created profile ${profile_id} for transaction ${profiledTransaction.event_id}`);
    return profile;
  };
}
