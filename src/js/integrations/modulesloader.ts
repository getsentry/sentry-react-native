import { EventProcessor, Integration, Event } from '@sentry/types';
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
    let modules: Record<string, string> | undefined;

    addGlobalEventProcessor(async (event: Event) => {
      if (!modules) {
        modules = await NATIVE.fetchModules();
      }
      event.modules = modules;
      return event;
    });
  }
}
