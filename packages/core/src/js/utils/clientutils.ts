import type { Client } from '@sentry/types';

/**
 * Checks if the provided Sentry client has hooks implemented.
 * @param client The Sentry client object to check.
 * @returns True if the client has hooks, false otherwise.
 */
export function hasHooks(client: Client): client is Client & { on: Required<Client>['on'] } {
  return client.on !== undefined;
}
