import type { IncomingMessage, ServerResponse } from 'http';

import { getRawBody } from './getRawBody';

/*
 * Prefix for Sentry Metro logs to make them stand out to the user.
 */
const S = '\u001b[45;1m SENTRY \u001b[0m';

let open: ((url: string) => Promise<void>) | undefined = undefined;

/**
 * Open a URL in the system browser.
 *
 * Inspired by https://github.com/react-native-community/cli/blob/a856ce027a6b25f9363a8689311cdd4416c0fc89/packages/cli-server-api/src/openURLMiddleware.ts#L17
 */
export async function openURLMiddleware(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end('Method not allowed. Use POST.');
    return;
  }

  if (!open) {
    try {
      // oxlint-disable-next-line import/no-extraneous-dependencies
      open = require('open');
    } catch (e) {
      // noop
    }
  }

  const body = await getRawBody(req);
  let url: string | undefined = undefined;

  try {
    const parsedBody = JSON.parse(body) as { url?: string };
    url = parsedBody.url;
  } catch (e) {
    res.writeHead(400);
    res.end('Invalid request body. Expected a JSON object with a url key.');
    return;
  }

  if (!url) {
    res.writeHead(400);
    res.end('Invalid request body. Expected a JSON object with a url key.');
    return;
  }

  if (!url.startsWith('https://') && !url.startsWith('http://')) {
    res.writeHead(400);
    res.end('Invalid URL scheme. Only http:// and https:// URLs are allowed.');
    return;
  }

  if (!isTrustedSentryHost(url)) {
    // oxlint-disable-next-line no-console
    console.log(`${S} Untrusted host, not opening automatically. Open manually if you trust this URL: ${url}`);
    res.writeHead(200);
    res.end();
    return;
  }

  if (!open) {
    // oxlint-disable-next-line no-console
    console.log(`${S} Could not open URL automatically. Open manually: ${url}`);
    res.writeHead(500);
    res.end('Failed to open URL. The "open" package is not available. Install it or open the URL manually.');
    return;
  }

  try {
    await open(url);
  } catch (e) {
    // oxlint-disable-next-line no-console
    console.log(`${S} Failed to open URL automatically. Open manually: ${url}`);
    res.writeHead(500);
    res.end('Failed to open URL.');
    return;
  }

  // oxlint-disable-next-line no-console
  console.log(`${S} Opened URL: ${url}`);
  res.writeHead(200);
  res.end();
}

function isTrustedSentryHost(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === 'sentry.io' || hostname.endsWith('.sentry.io');
  } catch (e) {
    return false;
  }
}
