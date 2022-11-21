import { addGlobalEventProcessor, getCurrentHub } from '@sentry/core';
import { Contexts, Event, Integration } from '@sentry/types';
import { logger } from '@sentry/utils';

import { NATIVE } from '../wrapper';

/** Load device context from native. */
export class DeviceContext implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'DeviceContext';

  /**
   * @inheritDoc
   */
  public name: string = DeviceContext.id;

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
        const contexts = await NATIVE.fetchNativeDeviceContexts();

        const context = contexts['context'] as Contexts ?? {};
        const user = contexts['user'] ?? {};

        event.contexts = { ...context, ...event.contexts };

        if (!event.user) {
          event.user = { ...user };
        }
      } catch (e) {
        logger.log(`Failed to get device context from native: ${e}`);
      }

      return event;
    });
  }
}
