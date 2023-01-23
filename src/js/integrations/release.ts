import { addGlobalEventProcessor, getCurrentHub } from '@sentry/core';
import type { Event, Integration } from '@sentry/types';

import { NATIVE } from '../wrapper';

/** Release integration responsible to load release from file. */
export class Release implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Release';
  /**
   * @inheritDoc
   */
  public name: string = Release.id;

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    addGlobalEventProcessor(async (event: Event) => {
      const self = getCurrentHub().getIntegration(Release);
      if (!self) {
        return event;
      }

      const options = getCurrentHub().getClient()?.getOptions();

      /*
        __sentry_release and __sentry_dist is set by the user with setRelease and setDist. If this is used then this is the strongest.
        Otherwise we check for the release and dist in the options passed on init, as this is stronger than the release/dist from the native build.
      */
      if (typeof event.extra?.__sentry_release === 'string') {
        event.release = `${event.extra.__sentry_release}`;
      } else if (typeof options?.release === 'string') {
        event.release = options.release;
      }

      if (typeof event.extra?.__sentry_dist === 'string') {
        event.dist = `${event.extra.__sentry_dist}`;
      } else if (typeof options?.dist === 'string') {
        event.dist = options.dist;
      }

      if (event.release && event.dist) {
        return event;
      }

      try {
        const nativeRelease = await NATIVE.fetchNativeRelease();
        if (nativeRelease) {
          if (!event.release) {
            event.release = `${nativeRelease.id}@${nativeRelease.version}+${nativeRelease.build}`;
          }
          if (!event.dist) {
            event.dist = `${nativeRelease.build}`;
          }
        }
      } catch (_Oo) {
        // Something went wrong, we just continue
      }

      return event;
    });
  }
}
