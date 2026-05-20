import type { Client, Integration } from '@sentry/core';

import { debug } from '@sentry/core';

import { getReactNavigationIntegration, reactNavigationIntegration } from './reactnavigation';

export const INTEGRATION_NAME = 'ExpoRouter';

const POLL_INTERVAL_MS = 50;
const POLL_MAX_DURATION_MS = 5_000;

interface ExpoRouterNavigationRef {
  current: unknown | null;
}

interface ExpoRouterStore {
  navigationRef?: ExpoRouterNavigationRef;
}

type ExpoRouterIntegrationOptions = Parameters<typeof reactNavigationIntegration>[0];

/**
 * Integration that connects Expo Router with `reactNavigationIntegration` without
 * requiring the user to manually pass a `useNavigationContainerRef()` ref.
 *
 * @example
 * ```ts
 * Sentry.init({
 *   integrations: [Sentry.expoRouterIntegration()],
 * });
 * ```
 */
export const expoRouterIntegration = (options: ExpoRouterIntegrationOptions = {}): Integration => {
  let pollTimer: ReturnType<typeof setTimeout> | undefined;

  const afterAllSetup = (client: Client): void => {
    const store = tryGetExpoRouterStore();
    if (!store) {
      // expo-router not installed
      return;
    }
    if (!store.navigationRef) {
      debug.warn(
        `${INTEGRATION_NAME} Found expo-router router-store but it does not expose a \`navigationRef\`. ` +
          `This likely means the installed expo-router version is incompatible with this integration.`,
      );
      return;
    }

    // reuse the user's reactNavigationIntegration if they registered one manually.
    // Otherwise, create and add one.
    let reactNavigation = getReactNavigationIntegration(client);
    if (!reactNavigation) {
      reactNavigation = reactNavigationIntegration(options);
      client.addIntegration(reactNavigation);
    }

    const navigationRef = store.navigationRef;

    if (navigationRef.current) {
      reactNavigation.registerNavigationContainer(navigationRef);
      return;
    }

    // Otherwise, poll until the Root Layout mounts and Expo Router sets `.current`.
    const startedAt = Date.now();
    const poll = (): void => {
      if (!navigationRef.current) {
        if (Date.now() - startedAt >= POLL_MAX_DURATION_MS) {
          debug.warn(`${INTEGRATION_NAME} Timed out waiting for Expo Router navigation container.`);
          pollTimer = undefined;
          return;
        }
        pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
        return;
      }

      reactNavigation?.registerNavigationContainer(navigationRef);
      pollTimer = undefined;
    };

    pollTimer = setTimeout(poll, POLL_INTERVAL_MS);

    client.on('close', () => {
      if (pollTimer !== undefined) {
        clearTimeout(pollTimer);
        pollTimer = undefined;
      }
    });
  };

  return {
    name: INTEGRATION_NAME,
    afterAllSetup,
  };
};

function tryGetExpoRouterStore(): ExpoRouterStore | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-router/build/global-state/router-store') as {
      store?: ExpoRouterStore;
    };
    return mod?.store ?? null;
  } catch {
    return null;
  }
}
