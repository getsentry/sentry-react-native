import type { Client, Integration } from '@sentry/core';
import { getClient, logger } from '@sentry/core';

import { isWeb } from '../utils/environment';
import { fillTyped } from '../utils/fill';
import { ReactNativeLibraries } from '../utils/rnlibraries';

export const INTEGRATION_NAME = 'AppRegistry';

export const appRegistryIntegration = (): Integration & {
  onRunApplication: (callback: () => void) => void;
} => {
  const callbacks: (() => void)[] = [];

  return {
    name: INTEGRATION_NAME,
    setupOnce: () => {
      if (isWeb()) {
        return;
      }

      patchAppRegistryRunApplication(callbacks);
    },
    onRunApplication: (callback: () => void) => {
      if (callbacks.includes(callback)) {
        logger.debug('[AppRegistryIntegration] Callback already registered.');
        return;
      }
      callbacks.push(callback);
    },
  };
};

export const patchAppRegistryRunApplication = (callbacks: (() => void)[]): void => {
  const { AppRegistry } = ReactNativeLibraries;
  if (!AppRegistry) {
    return;
  }

  fillTyped(AppRegistry, 'runApplication', originalRunApplication => {
    return (...args) => {
      callbacks.forEach(callback => callback());
      return originalRunApplication(...args);
    };
  });
};

export const getAppRegistryIntegration = (
  client: Client | undefined = getClient(),
): ReturnType<typeof appRegistryIntegration> | undefined => {
  if (!client) {
    return undefined;
  }

  return client.getIntegrationByName(INTEGRATION_NAME);
};
