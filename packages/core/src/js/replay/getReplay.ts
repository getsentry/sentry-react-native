import { getClient } from '@sentry/core';

import type { Replay } from './replayInterface';

import { BROWSER_REPLAY_INTEGRATION_NAME } from './browserReplay';
import { MOBILE_REPLAY_INTEGRATION_NAME } from './mobilereplay';

/**
 * Returns the active Session Replay integration, letting you control the replay
 * at runtime with the same API on every platform:
 *
 * ```js
 * Sentry.getReplay()?.start();
 * ```
 *
 * Resolves the mobile (native iOS/Android) replay integration when present, and
 * otherwise the browser replay integration (React Native Web). Returns
 * `undefined` when no replay integration is installed on the active client.
 *
 * @see {@link Replay} for the available controls.
 */
export function getReplay(): Replay | undefined {
  const client = getClient();
  if (!client) {
    return undefined;
  }

  return (
    client.getIntegrationByName<Replay>(MOBILE_REPLAY_INTEGRATION_NAME) ??
    client.getIntegrationByName<Replay>(BROWSER_REPLAY_INTEGRATION_NAME)
  );
}
