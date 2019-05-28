import { addGlobalEventProcessor, getCurrentHub } from "@sentry/core";
import { Event, Integration } from "@sentry/types";

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
    addGlobalEventProcessor((event: Event) => {
      const self = getCurrentHub().getIntegration(Release);
      if (!self) {
        return event;
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
