import { describe, it, beforeAll, expect } from '@jest/globals';
import { device, element, by } from 'detox';
import { IncomingMessage, ServerResponse, createServer } from 'node:http';
import { createGunzip } from 'node:zlib';
import {
  BaseEnvelopeHeaders,
  BaseEnvelopeItemHeaders,
  Envelope,
} from '@sentry/core';

describe('Capture message', () => {
  let sentryServer = createSentryServer();
  sentryServer.start();

  let envelope: Envelope;

  beforeAll(async () => {
    await device.launchApp();
    await element(by.text('Capture message')).tap();
    envelope = await sentryServer.waitForEnvelope(containingEvent);
  });

  afterAll(async () => {
    await sentryServer.close();
  });

  it('contains event_id and sent_at in the envelope header', async () => {
    expect(envelope[0]).toEqual(
      expect.objectContaining({
        event_id: expect.any(String),
        sent_at: expect.any(String),
      }),
    );
  });

  it('contains sdk info in the envelope header', async () => {
    expect(envelope[0]).toEqual(
      expect.objectContaining({
        sdk: {
          features: [],
          integrations: [],
          name: 'sentry.javascript.react-native',
          packages: [],
          version: expect.any(String),
        },
        sent_at: expect.any(String),
      }),
    );
  });

  it('contains trace info in the envelope header', async () => {
    expect(envelope).toEqual([
      {
        trace: {
          environment: expect.any(String),
          public_key: expect.any(String),
          replay_id: expect.any(String),
          sample_rate: '1',
          sampled: '1',
          trace_id: expect.any(String),
          transaction: 'ErrorsScreen',
        },
      },
    ]);
  });

  it('contains a message event', async () => {
    expect(envelope[1]).toEqual(
      expect.arrayContaining([
        {
          length: expect.any(Number),
          type: 'event',
        },
        {
          level: 'info',
          message: 'Captured message',
          platform: 'javascript',
        },
      ]),
    );
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
  ) => Promise<Envelope>;
  close: () => Promise<void>;
  start: () => void;
} {
  const requests: any[] = [];

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let body: Buffer = Buffer.from([]);

    const gunzip = createGunzip();
    req.pipe(gunzip);

    gunzip.on('data', (chunk: Buffer) => {
      body = Buffer.concat([body, chunk]);
    });

    gunzip.on('end', () => {
      requests.push({
        path: req.url,
        headers: req.headers,
        body: body,
        envelope: parseEnvelope(body),
      });
      body = Buffer.from([]);

      res.writeHead(200);
      res.end('OK');
    });
  });

  return {
    start: () => {
      server.listen(port);
    },
    waitForEnvelope: async (
      predicate: (envelope: Envelope) => boolean,
    ): Promise<Envelope> => {
      return new Promise<Envelope>((resolve, reject) => {
        const checkRequests = () => {
          // todo only check newly incoming requests
          for (const request of requests) {
            try {
              if (predicate(request.envelope)) {
                const fs = require('fs');
                fs.writeFileSync('request-body.txt', request.body.toString());
                fs.writeFileSync(
                  'request-envelope.json',
                  JSON.stringify(request.envelope, null, 2),
                );
                resolve(request.envelope);
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

/**
 * Parses an envelope
 */
export function parseEnvelope(env: string | Uint8Array): Envelope {
  let buffer = typeof env === 'string' ? encodeUTF8(env) : env;

  function readBinary(length: number): Uint8Array {
    const bin = buffer.subarray(0, length);
    // Replace the buffer with the remaining data excluding trailing newline
    buffer = buffer.subarray(length + 1);
    return bin;
  }

  function readJson<T>(): T {
    let i = buffer.indexOf(0xa);
    // If we couldn't find a newline, we must have found the end of the buffer
    if (i < 0) {
      i = buffer.length;
    }

    return JSON.parse(decodeUTF8(readBinary(i))) as T;
  }

  const envelopeHeader = readJson<BaseEnvelopeHeaders>();

  const items: [any, any][] = [];

  while (buffer.length) {
    const itemHeader = readJson<BaseEnvelopeItemHeaders>();
    const isBinary =
      itemHeader.type === 'attachment' &&
      itemHeader.content_type !== 'application/json';
    const binaryLength = isBinary ? itemHeader.length : undefined;

    items.push([
      itemHeader,
      binaryLength ? readBinary(binaryLength) : readJson(),
    ]);
  }

  return [envelopeHeader, items];
}

/**
 * Encode a string to UTF8 array.
 */
function encodeUTF8(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

/**
 * Decode a UTF8 array to string.
 */
function decodeUTF8(input: Uint8Array): string {
  return new TextDecoder().decode(input);
}
