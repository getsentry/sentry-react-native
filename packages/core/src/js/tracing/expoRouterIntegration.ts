import type { Client, Integration } from '@sentry/core';

import { debug } from '@sentry/core';

import type { ExpoRouterStore, ExpoRouterUrlObject } from './expoRouterStore';
import type { RouteOverride } from './reactnavigation';

import { buildExpoRouterTemplatedPath, tryGetExpoRouterStore } from './expoRouterStore';
import { getReactNavigationIntegration, reactNavigationIntegration } from './reactnavigation';

export { buildExpoRouterTemplatedPath };

export const INTEGRATION_NAME = 'ExpoRouter';

const POLL_INTERVAL_MS = 50;
const POLL_MAX_DURATION_MS = 5_000;

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

    // `Sentry.init()` is typically called at module eval time (as the docs recommend),
    // which runs before Expo Router's Root Layout mounts. Both `store.navigationRef` and
    // `navigationRef.current` may still be undefined here — poll for both to appear.
    // Defer adding `reactNavigationIntegration` until we can also register it, so a
    // timeout can never leave a non-functional integration attached to the client.
    const startedAt = Date.now();

    const poll = (): void => {
      const navigationRef = store.navigationRef;

      if (navigationRef?.current) {
        // Reuse the user's reactNavigationIntegration if they registered one manually.
        // Otherwise, create and add one.
        const existing = getReactNavigationIntegration(client);
        const reactNavigation = existing ?? reactNavigationIntegration(options);
        if (!existing) {
          client.addIntegration(reactNavigation);
        }
        reactNavigation._setRouteOverrideProvider?.(() => buildExpoRouterRouteOverride(store));
        reactNavigation.registerNavigationContainer(navigationRef);
        pollTimer = undefined;
        return;
      }

      if (Date.now() - startedAt >= POLL_MAX_DURATION_MS) {
        if (!navigationRef) {
          debug.warn(
            `${INTEGRATION_NAME} Found expo-router router-store but it does not expose a \`navigationRef\`. ` +
              `This likely means the installed expo-router version is incompatible with this integration.`,
          );
        } else {
          debug.warn(`${INTEGRATION_NAME} Timed out waiting for Expo Router navigation container.`);
        }
        pollTimer = undefined;
        return;
      }

      pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();

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

function buildExpoRouterRouteOverride(store: ExpoRouterStore): RouteOverride | undefined {
  let info: ExpoRouterUrlObject | undefined;
  try {
    info = store.getRouteInfo?.();
  } catch {
    return undefined;
  }
  if (!info) {
    return undefined;
  }

  const templatedPath = buildExpoRouterTemplatedPath(info.segments);
  return {
    templatedPath,
    concreteUrl: info.pathnameWithParams ?? info.pathname,
    params: info.params,
  };
}
