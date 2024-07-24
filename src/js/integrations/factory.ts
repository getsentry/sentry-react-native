import type { Integration } from '@sentry/types';

/**
 * Creates an integration out of the provided name and setup function.
 * @hidden
 */
export function createIntegration(
  name: Integration['name'],
  setupOnce: Integration['setupOnce'] = () => {
    /* noop */
  },
): Integration {
  return {
    name: name,
    setupOnce,
  };
}
