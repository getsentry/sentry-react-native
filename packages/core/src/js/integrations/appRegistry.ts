import { ReactNativeLibraries } from '../utils/rnlibraries';
import { fillTyped } from '../utils/fill';
import { Client, getClient, Integration } from '@sentry/core';

export const INTEGRATION_NAME = 'appRegistryIntegration';

export const appRegistryIntegration = (): Integration & {
  onRunApplication: (callback: () => void) => void;
} => {
  const callbacks: (() => void)[] = [];

  return {
    name: INTEGRATION_NAME,
    setupOnce: () => {
      patchAppRegistryRunApplication(callbacks);
    },
    onRunApplication: (callback: () => void) => {
      callbacks.push(callback);
    },
  };
};

export const patchAppRegistryRunApplication = (callbacks: (() => void)[]) => {
  const { AppRegistry } = ReactNativeLibraries;

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
