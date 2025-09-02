import { useEncodePolyfill } from '../transports/encodePolyfill';
import { getSentryCarrier } from './carrier';

/**
 * Encode a string to UTF8 array.
 */
export function encodeUTF8(input: string): Uint8Array {
  const carrier = getSentryCarrier();
  if (!carrier.encodePolyfill) {
    useEncodePolyfill();
  }

  return carrier.encodePolyfill!(input);
}
