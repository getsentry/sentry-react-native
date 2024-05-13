import type {
  BaseTransportOptions,
  Client,
  ClientOptions,
  Envelope,
  Integration,
  IntegrationFnResult,
} from '@sentry/types';
import { logger, serializeEnvelope } from '@sentry/utils';

import { makeUtf8TextEncoder } from '../transports/TextEncoder';
import { ReactNativeLibraries } from '../utils/rnlibraries';
import { createStealthXhr, XHR_READYSTATE_DONE } from '../utils/xhr';

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
 * Use this integration to send errors and transactions to Spotlight.
 *
 * Learn more about spotlight at https://spotlightjs.com
 */
export function spotlightIntegration({
  sidecarUrl = getDefaultSidecarUrl(),
}: SpotlightReactNativeIntegrationOptions = {}): IntegrationFnResult {
  logger.info('[Spotlight] Using Sidecar URL', sidecarUrl);

  return {
    name: 'Spotlight',

    setupOnce(): void {
      // nothing to do here
    },

    setup(client: Client<ClientOptions<BaseTransportOptions>>): void {
      setup(client, sidecarUrl);
    },
  };
}

/**
 * Use this integration to send errors and transactions to Spotlight.
 *
 * Learn more about spotlight at https://spotlightjs.com
 *
 * @deprecated Use `spotlightIntegration()` instead.
 */
export const Spotlight = spotlightIntegration as (...args: Parameters<typeof spotlightIntegration>) => Integration;

function setup(client: Client, sidecarUrl: string): void {
  sendEnvelopesToSidecar(client, sidecarUrl);
}

function sendEnvelopesToSidecar(client: Client, sidecarUrl: string): void {
  if (!client.on) {
    return;
  }

  client.on('beforeEnvelope', (originalEnvelope: Envelope) => {
    // TODO: This is a workaround for spotlight/sidecar not supporting images
    const spotlightEnvelope: Envelope = [...originalEnvelope];
    const envelopeItems = [...originalEnvelope[1]].filter(
      item => typeof item[0].content_type !== 'string' || !item[0].content_type.startsWith('image'),
    );

    spotlightEnvelope[1] = envelopeItems as Envelope[1];

    const xhr = createStealthXhr();
    if (!xhr) {
      logger.error('[Spotlight] Sentry SDK can not create XHR object');
      return;
    }

    xhr.open('POST', sidecarUrl, true);
    xhr.setRequestHeader('Content-Type', 'application/x-sentry-envelope');

    xhr.onreadystatechange = function () {
      if (xhr.readyState === XHR_READYSTATE_DONE) {
        const status = xhr.status;
        if (status === 0 || (status >= 200 && status < 400)) {
          // The request has been completed successfully
        } else {
          // Handle the error
          logger.error(
            "[Spotlight] Sentry SDK can't connect to Spotlight is it running? See https://spotlightjs.com to download it.",
            new Error(xhr.statusText),
          );
        }
      }
    };

    xhr.send(serializeEnvelope(spotlightEnvelope, makeUtf8TextEncoder()));
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
