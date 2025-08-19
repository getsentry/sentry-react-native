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
  if (!open) {
    try {
      // eslint-disable-next-line import/no-extraneous-dependencies
      open = require('open');
    } catch (e) {
      // noop
    }
  }

  if (req.method === 'POST') {
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

    try {
      if (!url) {
        res.writeHead(400);
        res.end('Invalid request body. Expected a JSON object with a url key.');
        return;
      }

      if (!open) {
        throw new Error('The "open" module is not available.');
      }

      await open(url);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log(`${S} Open: ${url}`);

      res.writeHead(500);

      if (!open) {
        res.end('Failed to open URL. The "open" module is not available.');
      } else {
        res.end('Failed to open URL.');
      }
      return;
    }

    // eslint-disable-next-line no-console
    console.log(`${S} Opened URL: ${url}`);
    res.writeHead(200);
    res.end();
  }
}
