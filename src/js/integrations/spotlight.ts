import type { Client, Envelope, EventProcessor, Integration } from '@sentry/types';
import { logger, serializeEnvelope } from '@sentry/utils';

import { makeUtf8TextEncoder } from '../transports/TextEncoder';
import { ReactNativeLibraries } from '../utils/rnlibraries';

type SpotlightReactNativeIntegrationOptions = {
  /**
   * The URL of the Sidecar instance to connect and forward events to.
   * If not set, Spotlight will try to connect to the Sidecar running on localhost:8969.
   *
   * @default "http://localhost:8969/stream"
   */
  sidecarUrl?: string;
};

/**
 *
 */
export function Spotlight({
  sidecarUrl = getDefaultSidecarUrl(),
}: SpotlightReactNativeIntegrationOptions = {}): Integration {
  logger.info('[Spotlight] Using Sidecar URL', sidecarUrl);

  return {
    name: 'Spotlight',

    setupOnce(_: (callback: EventProcessor) => void, getCurrentHub) {
      const client = getCurrentHub().getClient();
      if (client) {
        setup(client, sidecarUrl);
      } else {
        logger.warn('[Spotlight] Could not initialize Sidecar integration due to missing Client');
      }
    },
  };
};

function setup(client: Client, sidecarUrl: string): void {
  sendEnvelopesToSidecar(client, sidecarUrl);
};

function sendEnvelopesToSidecar(client: Client, sidecarUrl: string): void {
  // Ensure, integrations are initialized even if no DSN was set
  // client.setupIntegrations(true);

  if (!client.on) {
    return;
  }

  client.on('beforeEnvelope', (envelope: Envelope) => {
    // TODO: This is a workaround for spotlight/sidecar not supporting images
    const envelopeItems= [...envelope[1]].filter(item =>
      typeof item[0].content_type !== 'string' ||
      !item[0].content_type.startsWith('image'));

    envelope[1] = envelopeItems as Envelope[1];

    fetch(sidecarUrl, {
      method: 'POST',
      body: serializeEnvelope(envelope, makeUtf8TextEncoder()),
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
      },
      mode: 'cors',
    }).catch(err => {
      logger.error(
        '[Spotlight] Sentry SDK can\'t connect to Sidecar is it running? See: https://spotlightjs.com/sidecar/npx/',
        err,
      );
    });
  });
}

function getDefaultSidecarUrl(): string {
  try {
    const { url } = ReactNativeLibraries.Devtools?.getDevServer();
    return `http://${getHostnameFromString(url)}:8969/stream`;
  } catch (_oO) {
    // We can't load devserver URL
  }
  return 'http://localhost:8969/stream';
}

/**
 * React Native implementation of the URL class is missing the `hostname` property.
 */
function getHostnameFromString(urlString: string): string | null {
  const regex = /^(?:\w+:)?\/\/([^/:]+)(:\d+)?(.*)$/;
  const matches = urlString.match(regex);

  if (matches && matches[1]) {
    return matches[1];
  } else {
    // Invalid URL format
    return null;
  }
}
