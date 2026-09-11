import { getClient } from '@sentry/core';

import type { Replay } from './replayInterface';

import { notMobileOs } from '../utils/environment';
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
 * Resolves the replay integration that is actually functional on the current
 * platform: the browser integration on React Native Web, and the mobile (native
 * iOS/Android) integration otherwise. This matters for universal apps that
 * install both, because on Web the mobile integration is a no-op stub — so the
 * browser integration must win there and the mobile one on native. Returns
 * `undefined` when no replay integration is installed on the active client.
 *
 * @see {@link Replay} for the available controls.
 */
export function getReplay(): Replay | undefined {
  const client = getClient();
  if (!client) {
    return undefined;
  }

  const mobileReplay = client.getIntegrationByName<Replay>(MOBILE_REPLAY_INTEGRATION_NAME);
  const browserReplay = client.getIntegrationByName<Replay>(BROWSER_REPLAY_INTEGRATION_NAME);

  return notMobileOs() ? (browserReplay ?? mobileReplay) : (mobileReplay ?? browserReplay);
}
