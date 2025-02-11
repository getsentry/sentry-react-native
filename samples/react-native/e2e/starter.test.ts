import { describe, it, beforeAll } from '@jest/globals';
import { device, element, by, expect } from 'detox';
import { IncomingMessage, ServerResponse, createServer } from 'node:http';
import { createGunzip } from 'node:zlib';
import { Envelope, parseEnvelope } from '@sentry/core';

describe('Example', () => {
  let sentryServer = createSentryServer();
  sentryServer.start();

  beforeAll(async () => {
    await device.launchApp();
  });

  afterAll(async () => {
    await sentryServer.close();
  });

  it('should have welcome screen', async () => {
    await element(by.text('Capture message')).tap();

    await sentryServer.waitForEnvelope(containingEvent);
  });
});

function containingEvent(envelope: Envelope) {
  return envelope[1].some(
    item => (item[0] as { type?: string }).type === 'event',
  );
}

function createSentryServer({ port = 8961 } = {}): {
  waitForEnvelope: (
    predicate: (envelope: Envelope) => boolean,
  ) => Promise<void>;
  close: () => Promise<void>;
  start: () => void;
} {
  const requests: any[] = [];

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let body = '';

    const gunzip = createGunzip();
    req.pipe(gunzip);

    gunzip.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });

    gunzip.on('end', () => {
      requests.push({
        path: req.url,
        headers: req.headers,
        body: body,
      });

      res.writeHead(200);
      res.end('OK');
    });
  });

  return {
    start: () => {
      server.listen(port);
    },
    waitForEnvelope: async (predicate: (envelope: Envelope) => boolean) => {
      return new Promise<void>((resolve, reject) => {
        const checkRequests = () => {
          // todo only check newly incomming requests
          for (const request of requests) {
            try {
              console.log('request', request);
              // Write request body to file for debugging
              const fs = require('fs');
              fs.writeFileSync('request-body.txt', request.body);
              const envelope: Envelope = parseEnvelope(request.body);

              if (predicate(envelope)) {
                console.log('envelope', envelope);
                resolve();
                return;
              }
            } catch (e) {
              reject(e);
              return;
            }
          }
          setTimeout(checkRequests, 100);
        };

        checkRequests();
      });
    },
    close: async () => {
      await new Promise<void>(resolve => {
        server.close(() => resolve());
      });
    },
  };
}
