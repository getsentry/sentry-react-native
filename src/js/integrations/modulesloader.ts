import type { Event, Integration } from '@sentry/types';
import { logger } from '@sentry/utils';

import { NATIVE } from '../wrapper';

/** Loads runtime JS modules from prepared file. */
export const modulesLoaderIntegration = (): Integration => {
  return {
    name: 'ModulesLoader',
    setupOnce: () => {
      // noop
    },
    processEvent: createProcessEvent(),
  };
};

function createProcessEvent(): (event: Event) => Promise<Event> {
  let isSetup = false;
  let modules: Record<string, string> | null = null;

  return async (event: Event) => {
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
  };
}
