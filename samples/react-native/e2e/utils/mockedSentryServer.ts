import { IncomingMessage, ServerResponse, createServer } from 'node:http';
import { createGunzip } from 'node:zlib';
import { Envelope } from '@sentry/core';
import { parseEnvelope } from './parseEnvelope';

type RecordedRequest = {
  path: string | undefined;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  envelope: Envelope;
};

export function createSentryServer({ port = 8961 } = {}): {
  waitForEnvelope: (
    predicate: (envelope: Envelope) => boolean,
  ) => Promise<Envelope>;
  close: () => Promise<void>;
  start: () => void;
} {
  let onNextRequestCallback: (request: RecordedRequest) => void = () => {};
  const requests: RecordedRequest[] = [];

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let body: Buffer = Buffer.from([]);

    const gunzip = createGunzip();
    req.pipe(gunzip);

    gunzip.on('data', (chunk: Buffer) => {
      body = Buffer.concat([body, chunk]);
    });

    gunzip.on('end', () => {
      const request = {
        path: req.url,
        headers: req.headers,
        body: body,
        envelope: parseEnvelope(body),
      };
      requests.push(request);

      body = Buffer.from([]);

      res.writeHead(200);
      res.end('OK');

      onNextRequestCallback(request);
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
        onNextRequestCallback = (request: RecordedRequest) => {
          try {
            if (predicate(request.envelope)) {
              resolve(request.envelope);
              return;
            }
          } catch (e) {
            reject(e);
            return;
          }
        };
      });
    },
    close: async () => {
      await new Promise<void>(resolve => {
        server.close(() => resolve());
      });
    },
  };
}

export function containingEvent(envelope: Envelope) {
  return envelope[1].some(
    item => (item[0] as { type?: string }).type === 'event',
  );
}
