import { addGlobalEventProcessor, getCurrentHub } from "@sentry/core";
import { Event, Integration } from "@sentry/types";
import { logger } from "@sentry/utils";
import { NativeModules } from "react-native";

const { RNSentry } = NativeModules;

/** Load device context from native. */
export class DeviceContext implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = DeviceContext.id;
  /**
   * @inheritDoc
   */
  public static id: string = "DeviceContext";

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    addGlobalEventProcessor(async (event: Event) => {
      const self = getCurrentHub().getIntegration(DeviceContext);
      if (!self) {
        return event;
      }

      try {
        // tslint:disable-next-line: no-unsafe-any
        const deviceContexts = await RNSentry.deviceContexts();
        event.contexts = { ...deviceContexts, ...event.contexts };
      } catch (e) {
        logger.log(`Failed to get device context from native: ${e}`);
      }

      return event;
    });
  }
}
