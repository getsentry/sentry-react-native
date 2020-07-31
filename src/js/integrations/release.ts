import { addGlobalEventProcessor, getCurrentHub } from "@sentry/core";
import { Event, Integration } from "@sentry/types";

import { NATIVE } from "../wrapper";

/** Release integration responsible to load release from file. */
export class Release implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = Release.id;
  /**
   * @inheritDoc
   */
  public static id: string = "Release";

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    addGlobalEventProcessor(async (event: Event) => {
      const self = getCurrentHub().getIntegration(Release);
      if (!self) {
        return event;
      }

      try {
        const release = await NATIVE.fetchRelease();
        if (release) {
          event.release = `${release.id}@${release.version}+${release.build}`;
          event.dist = `${release.build}`;
        }
      } catch (_Oo) {
        // Something went wrong, we just continue
      }

      const options = getCurrentHub().getClient()?.getOptions();

      /*
        __sentry_release and __sentry_dist is set by the user with setRelease and setDist. If this is used then this is the strongest.
        Otherwise we check for the release and dist in the options passed on init, as this is stronger than the release/dist from the native build.
      */
      if (typeof event.extra?.__sentry_release === "string") {
        event.release = `${event.extra.__sentry_release}`;
      } else if (typeof options?.release === "string") {
        event.release = options.release;
      }

      if (typeof event.extra?.__sentry_dist === "string") {
        event.dist = `${event.extra.__sentry_dist}`;
      } else if (typeof options?.dist === "string") {
        event.dist = options.dist;
      }

      return event;
    });
  }
}
