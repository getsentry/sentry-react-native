import { Client } from '@sentry/types';

export function hasHooks(client: Client): client is Client & { on: Required<Client>['on'] } {
  return client.on !== undefined;
}
