import { convertIntegrationFnToClass } from '@sentry/core';
import type { Event, Integration, IntegrationClass, IntegrationFnResult } from '@sentry/types';
import { logger } from '@sentry/utils';

import { NATIVE } from '../wrapper';

const INTEGRATION_NAME = 'ModulesLoader';

/** Loads runtime JS modules from prepared file. */
export const modulesLoaderIntegration = (): IntegrationFnResult => {
  return {
    name: INTEGRATION_NAME,
    setupOnce: () => {
      // noop
    },
    processEvent: createProcessEvent(),
  };
};

/**
 * Loads runtime JS modules from prepared file.
 *
 * @deprecated Use `modulesLoaderIntegration()` instead.
 */
// eslint-disable-next-line deprecation/deprecation
export const ModulesLoader = convertIntegrationFnToClass(
  INTEGRATION_NAME,
  modulesLoaderIntegration,
) as IntegrationClass<Integration>;

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
