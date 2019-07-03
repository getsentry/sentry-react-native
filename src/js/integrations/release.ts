import { addGlobalEventProcessor, getCurrentHub } from "@sentry/core";
import { Event, Integration } from "@sentry/types";
import { NativeModules } from "react-native";

const { RNSentry } = NativeModules;

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
        const release = (await RNSentry.fetchRelease()) as {
          build: string;
          id: string;
          version: string;
        };
        if (release) {
          event.release = `${release.id}-${release.version}`;
          event.dist = `${release.build}`;
        }
      } catch (_Oo) {
        // Something went wrong, we just continue
      }

      // __sentry_release & __sentry_dist will be picked up by our native integration.
      // It should live in extra, native will pick it up there and set it in the event.
      if (event.extra && event.extra.__sentry_release && !event.release) {
        event.release = `${event.extra.__sentry_release}`;
      }
      if (event.extra && event.extra.__sentry_dist && !event.dist) {
        event.dist = `${event.extra.__sentry_dist}`;
      }

      return event;
    });
  }
}
