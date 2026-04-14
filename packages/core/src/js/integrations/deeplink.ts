import type { IntegrationFn } from '@sentry/core';
import { addBreadcrumb, defineIntegration, getClient } from '@sentry/core';

import { sanitizeUrl } from '../tracing/utils';

export const INTEGRATION_NAME = 'DeepLink';

/**
 * Replaces dynamic path segments (UUID-like or numeric values) with a placeholder
 * to avoid capturing PII in path segments when `sendDefaultPii` is off.
 *
 * Only replaces segments that look like identifiers (all digits, UUIDs, or hex strings).
 */
function sanitizeDeepLinkUrl(url: string): string {
  const stripped = sanitizeUrl(url);

  // Replace path segments that look like dynamic IDs:
  // - Numeric segments (e.g. /123)
  // - UUID-formatted segments (e.g. /a1b2c3d4-e5f6-7890-abcd-ef1234567890)
  // - Hex strings ≥8 chars (e.g. /deadbeef1234)
  return stripped.replace(
    /\/([0-9]+|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|[a-f0-9]{8,})(?=\/|$)/gi,
    '/<id>',
  );
}

/**
 * Returns the URL to include in the breadcrumb, respecting `sendDefaultPii`.
 * When PII is disabled, query strings and ID-like path segments are removed.
 */
function getBreadcrumbUrl(url: string): string {
  const sendDefaultPii = getClient()?.getOptions()?.sendDefaultPii ?? false;
  return sendDefaultPii ? url : sanitizeDeepLinkUrl(url);
}

function addDeepLinkBreadcrumb(url: string): void {
  const breadcrumbUrl = getBreadcrumbUrl(url);
  addBreadcrumb({
    category: 'deeplink',
    type: 'navigation',
    message: breadcrumbUrl,
    data: {
      url: breadcrumbUrl,
    },
  });
}

const _deeplinkIntegration: IntegrationFn = () => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      const Linking = tryGetLinking();

      if (!Linking) {
        return;
      }

      // Cold start: app opened via deep link
      Linking.getInitialURL()
        .then((url: string | null) => {
          if (url) {
            addDeepLinkBreadcrumb(url);
          }
        })
        .catch(() => {
          // Ignore errors from getInitialURL
        });

      // Warm open: deep link received while app is running
      const subscription = Linking.addEventListener('url', (event: { url: string }) => {
        if (event?.url) {
          addDeepLinkBreadcrumb(event.url);
        }
      });

      client.on('close', () => {
        subscription?.remove();
      });
    },
  };
};

/**
 * Attempts to import React Native's Linking module without a hard dependency.
 * Returns null if not available (e.g. in web environments).
 */
interface LinkingSubscription {
  remove: () => void;
}

interface RNLinking {
  getInitialURL: () => Promise<string | null>;
  addEventListener: (event: string, handler: (event: { url: string }) => void) => LinkingSubscription;
}

function tryGetLinking(): RNLinking | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Linking } = require('react-native') as { Linking: RNLinking };
    return Linking ?? null;
  } catch {
    return null;
  }
}

/**
 * Integration that automatically captures breadcrumbs when deep links are received.
 *
 * Intercepts links via React Native's `Linking` API:
 * - `getInitialURL` for cold starts (app opened via deep link)
 * - `addEventListener('url', ...)` for warm opens (link received while running)
 *
 * Respects `sendDefaultPii`: when disabled, query params and ID-like path segments
 * are stripped from the URL before it is recorded.
 *
 * Compatible with both Expo Router and plain React Navigation deep linking.
 *
 * @example
 * ```ts
 * Sentry.init({
 *   integrations: [deeplinkIntegration()],
 * });
 * ```
 */
export const deeplinkIntegration = defineIntegration(_deeplinkIntegration);
