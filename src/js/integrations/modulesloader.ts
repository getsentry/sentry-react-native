import { Event,EventProcessor, Integration } from '@sentry/types';

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
        modules = await NATIVE.fetchModules();
        isSetup = true;
      }
      if (modules) {
        event.modules = {
          ...event.modules,
          ...modules,
        };
      }
      return event;
    });
  }
}
