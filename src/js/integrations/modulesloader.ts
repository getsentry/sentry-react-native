import type { Event, EventProcessor, Integration } from '@sentry/types';
import { logger } from '@sentry/utils';

import { NATIVE } from '../wrapper';

/** Loads runtime JS modules from prepared file. */
export class ModulesLoader implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'ModulesLoader';

  /**
   * @inheritDoc
   */
  public name: string = ModulesLoader.id;

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (e: EventProcessor) => void): void {
    let isSetup = false;
    let modules: Record<string, string> | null;

    addGlobalEventProcessor(async (event: Event) => {
      if (!isSetup) {
        try {
          modules = await NATIVE.fetchModules();
        } catch (e) {
          logger.log(`Failed to get modules from native: ${e}`);
        }
        isSetup = true;
      }
      if (modules) {
        event.modules = {
          ...modules,
          ...event.modules,
        };
      }
      return event;
    });
  }
}
