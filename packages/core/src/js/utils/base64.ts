import { useBase64Polyfill } from '../transports/base64Polyfill';
import { getSentryCarrier } from './carrier';

/**
 * Encode a byte array to a base64 string.
 */
export function encodeToBase64(input: Uint8Array | number[]): string {
  const carrier = getSentryCarrier();
  if (!carrier.base64Polyfill) {
    useBase64Polyfill();
  }

  return carrier.base64Polyfill!(input);
}
