import { getSentryCarrier } from './carrier';

/**
 * Encode a string to UTF8 array.
 */
export function encodeUTF8(input: string): Uint8Array {
  const carrier = getSentryCarrier();
  return carrier.encodePolyfill ? carrier.encodePolyfill(input) : new TextEncoder().encode(input);
}
