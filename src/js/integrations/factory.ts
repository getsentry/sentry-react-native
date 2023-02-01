import type {
  Integration,
} from '@sentry/types';

export function createIntegration(
  name: Integration['name'],
  setupOnce: Integration['setupOnce'] = () => { },
): Integration {
  return {
    name: name,
    setupOnce,
  };
}
