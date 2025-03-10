import {
  Envelope,
  BaseEnvelopeHeaders,
  BaseEnvelopeItemHeaders,
} from '@sentry/core';

/**
 * Parses an envelope
 */
export function parseEnvelope(env: string | Uint8Array): Envelope {
  let buffer = typeof env === 'string' ? encodeUTF8(env) : env;

  function readBinary(length?: number): Uint8Array {
    if (!length) {
      throw new Error('Binary Envelope Items must have a length to be read');
    }
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
    const isBinaryAttachment =
      itemHeader.type === 'attachment' &&
      itemHeader.content_type !== 'application/json';
    // TODO: Parse when needed for the tests
    const isReplayVideo = (itemHeader.type as string) === 'replay_video';

    try {
      let item: any = {};
      if (isReplayVideo || isBinaryAttachment) {
        item = readBinary(itemHeader.length);
      } else {
        item = readJson();
      }
      items.push([itemHeader, item]);
    } catch (e) {
      console.error(e, 'itemHeader', itemHeader, 'buffer', buffer.toString());
      throw e;
    }
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
