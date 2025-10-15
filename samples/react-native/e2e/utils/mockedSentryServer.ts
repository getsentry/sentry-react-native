import { IncomingMessage, ServerResponse, createServer } from 'node:http';
import { createGunzip } from 'node:zlib';
import { Envelope, EnvelopeItem } from '@sentry/core';
import { parseEnvelope } from './parseEnvelope';
import { Event } from '@sentry/core';

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
  start: () => Promise<void>;
  getEnvelope: (predicate: (envelope: Envelope) => boolean) => Envelope;
  getAllEnvelopes: (predicate: (envelope: Envelope) => boolean) => Envelope[];
} {
  const nextRequestCallbacks: (typeof onNextRequestCallback)[] = [];
  let onNextRequestCallback: (request: RecordedRequest) => void = (
    request: RecordedRequest,
  ) => {
    nextRequestCallbacks.forEach(callback => callback(request));
  };
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

  const getAllEnvelopes = (predicate: (envelope: Envelope) => boolean) => {
    return requests
      .filter(request => request.envelope && predicate(request.envelope))
      .map(request => request.envelope);
  };

  return {
    start: () => {
      return new Promise<void>((resolve, _reject) => {
        server.listen(port, () => {
          console.log(`Sentry server listening on port ${port}`);
          resolve();
        });
      });
    },
    waitForEnvelope: async (
      predicate: (envelope: Envelope) => boolean,
    ): Promise<Envelope> => {
      return new Promise<Envelope>((resolve, reject) => {
        nextRequestCallbacks.push((request: RecordedRequest) => {
          try {
            if (predicate(request.envelope)) {
              resolve(request.envelope);
              return;
            }
          } catch (e) {
            reject(e);
            return;
          }
        });
      });
    },
    close: async () => {
      await new Promise<void>(resolve => {
        server.close(() => resolve());
      });
    },
    getEnvelope: (predicate: (envelope: Envelope) => boolean) => {
      const [envelope] = getAllEnvelopes(predicate);
      if (!envelope) {
        throw new Error('Envelope not found');
      }

      return envelope;
    },
    getAllEnvelopes,
  };
}

export function containingEvent(envelope: Envelope) {
  return envelope[1].some(item => itemHeaderIsType(item[0], 'event'));
}

export function containingEventWithAndroidMessage(message: string) {
  return (envelope: Envelope) =>
    envelope[1].some(
      item =>
        itemHeaderIsType(item[0], 'event') &&
        itemBodyIsEvent(item[1]) &&
        item[1].message &&
        (item[1].message as unknown as { message: string }).message === message,
    );
}

export function containingEventWithMessage(message: string) {
  return (envelope: Envelope) =>
    envelope[1].some(
      item =>
        itemHeaderIsType(item[0], 'event') &&
        itemBodyIsEvent(item[1]) &&
        item[1].message === message,
    );
}

export function containingTransaction(envelope: Envelope) {
  return envelope[1].some(item => itemHeaderIsType(item[0], 'transaction'));
}

export function containingTransactionWithName(name: string) {
  return (envelope: Envelope) =>
    envelope[1].some(
      item =>
        itemHeaderIsType(item[0], 'transaction') &&
        itemBodyIsEvent(item[1]) &&
        item[1].transaction &&
        item[1].transaction.includes(name),
    );
}

export function takeSecond(predicate: (envelope: Envelope) => boolean) {
  const take = 2;
  let counter = 0;
  return (envelope: Envelope) => {
    if (predicate(envelope)) {
      counter++;
    }

    if (counter === take) {
      return true;
    }

    return false;
  };
}

export function itemBodyIsEvent(itemBody: EnvelopeItem[1]): itemBody is Event {
  return typeof itemBody === 'object' && 'event_id' in itemBody;
}

export function itemHeaderIsType(itemHeader: EnvelopeItem[0], type: string) {
  if (typeof itemHeader !== 'object' || !('type' in itemHeader)) {
    return false;
  }

  if (itemHeader.type !== type) {
    return false;
  }

  return true;
}
