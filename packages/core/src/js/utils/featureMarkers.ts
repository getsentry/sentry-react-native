import type { Client } from '@sentry/core';

import { getClient } from '@sentry/core';

/**
 * Registers a no-op named integration on the client so the feature name flows
 * through to `event.sdk.integrations` — the channel Sentry uses to measure
 * feature adoption across SDKs.
 *
 * The registration is idempotent: a second call with the same name is a no-op
 * because `getIntegrationByName` returns the existing entry.
 *
 * Failing quietly is intentional. Feature-adoption telemetry must never break
 * the host app: if no client is available, or `addIntegration` is unavailable,
 * the caller keeps working without a marker.
 *
 * @param name The name to register.
 * @param client Optional explicit client. Falls back to `getClient()`.
 */
export function registerFeatureMarker(name: string, client: Client | undefined = getClient()): void {
  if (!client || client.getIntegrationByName?.(name)) {
    return;
  }
  client.addIntegration?.({ name });
}
