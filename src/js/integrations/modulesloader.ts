import { EventProcessor, Integration } from '@sentry/types';
import { logger } from '@sentry/utils';
import { NATIVE } from '../wrapper';

import modules from './modules.json';

const test: {} = modules;

export { test };

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
  public setupOnce(_addGlobalEventProcessor: (e: EventProcessor) => void): void {
    NATIVE.fetchModules().then((modules: unknown) => {
      console.log('modules', modules);
    });
    logger.log('ModulesLoader.setupOnce()', modules);
  }
}
