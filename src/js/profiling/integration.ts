import type { Envelope, EventProcessor, Hub, Integration, Transaction } from '@sentry/types';
import { logger, uuid4 } from '@sentry/utils';

import type {
  Profile,
} from './types';
import {
  addProfilesToEnvelope,
  createProfilingEvent,
  findProfiledTransactionsFromEnvelope,
} from './utils';
import { PROFILING_EVENT_CACHE } from './cache';
import { startProfiling, stopProfiling } from './hermes';

/**
 *
 */
export class ProfilingIntegration implements Integration {

  /**
   * @inheritDoc
   */
  public static id: string = 'ProfilingIntegration';

  /**
   * @inheritDoc
   */
  public name: string = ProfilingIntegration.id;

  private _currentProfile: {
    profile_id: string;
    startTimestampNs: number;
  } | undefined;

  /**
   * @inheritDoc
   */
  public setupOnce(_: (e: EventProcessor) => void, getCurrentHub: () => Hub): void {
    const client = getCurrentHub().getClient();

    if (!client || typeof client.on !== 'function') {
      return;
    }

    client.on('startTransaction', (transaction: Transaction) => {
      // TODO: maybeProfile use sample rate or sample to start profiling
      void this._finishCurrentProfile();
      // TODO: _startProfileTimeout
      const profileStartTimestampNs = startProfiling();
      this._currentProfile = {
        profile_id: uuid4(),
        startTimestampNs: profileStartTimestampNs,
      };
      transaction.setContext('profile', { profile_id: this._currentProfile.profile_id });
      // @ts-expect-error profile_id is not part of the metadata type
      transaction.setMetadata({ profile_id: this._currentProfile.profile_id });
      logger.log(
        '[Profiling] started profiling: ',
        this._currentProfile.profile_id,
      );
    });

    client.on('finishTransaction', () => {
      // TODO: _stopProfileTimeout
      this._finishCurrentProfile();
    });

    client.on('beforeEnvelope', (envelope: Envelope) => {
      // if not profiles are in queue, there is nothing to add to the envelope.
      if (!PROFILING_EVENT_CACHE.size()) {
        return;
      }

      const profiledTransactionEvents = findProfiledTransactionsFromEnvelope(envelope);
      if (!profiledTransactionEvents.length) {
        __DEV__ && logger.log('[Profiling] no profiled transactions found in envelope');
        return;
      }

      const profilesToAddToEnvelope: Profile[] = [];
      // eslint-disable-next-line @typescript-eslint/prefer-for-of
      for (let i = 0; i < profiledTransactionEvents.length; i++) {
        const profiledTransaction = profiledTransactionEvents[i];
        const profile_id = profiledTransaction?.contexts?.['profile']?.['profile_id'];

        if (!profile_id) {
          logger.log('[Profiling] cannot find profile for a transaction without a profile context');
          continue;
        }

        // Remove the profile from the transaction context before sending, relay will take care of the rest.
        if (profiledTransaction?.contexts?.['.profile']) {
          delete profiledTransaction.contexts.profile;
        }

        // We need to find both a profile and a transaction event for the same profile_id.
        const profileIndex = PROFILE_QUEUE.findIndex((p) => p.profile_id === profile_id);
        if (profileIndex === -1) {
          if (__DEV__) {
            logger.log(`[Profiling] Could not retrieve profile for transaction: ${profile_id}`);
          }
          continue;
        }

        const cpuProfile = PROFILE_QUEUE[profileIndex];
        if (!cpuProfile) {
          if (__DEV__) {
            logger.log(`[Profiling] Could not retrieve profile for transaction: ${profile_id}`);
          }
          continue;
        }

        // Remove the profile from the queue.
        PROFILE_QUEUE.splice(profileIndex, 1);
        const profile = createProfilingEvent(cpuProfile, profiledTransaction);

        if (profile) {
          profilesToAddToEnvelope.push(profile);
          __DEV__ && logger.log(`[Profiling] Added profile ${profile_id} to transaction ${profiledTransaction.event_id}`);
        }
      }
      addProfilesToEnvelope(envelope, profilesToAddToEnvelope);
    });
  }

  private

  /**
   * Stops profiling and adds the profile to the queue to be processed on beforeEnvelope.
   */
  private _finishCurrentProfile = (): void => {
    if (this._currentProfile === undefined) {
      return;
    }

    const profile = stopProfiling();
    if (!profile) {
      logger.warn('[Profiling] Stop failed. Cleaning up...');
      this._currentProfile = undefined;
      return;
    }

    profile.profile_id = this._currentProfile.profile_id;
    addToProfileQueue(profile);
    logger.log('[Profiling] finished profiling: ', this._currentProfile.profile_id);
    this._currentProfile = undefined;
  };

}
