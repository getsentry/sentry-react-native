import { base64StringFromByteArray } from '../vendor';

// Chunk size for `String.fromCharCode.apply` — keeps argument count well below
// engine limits while still amortising the call overhead across many bytes.
const CHUNK_SIZE = 0x8000;

/**
 * Encodes a byte array to base64. Uses the runtime's native `btoa` when
 * available (Hermes and modern JSC both expose it), which is significantly
 * faster than the pure-JS encoder for the envelope payloads going through
 * `RNSentry.captureEnvelope`. Falls back to the bundled JS encoder when
 * `btoa` is missing (e.g. older JS engines).
 */
export function encodeToBase64(bytes: Uint8Array): string {
  const nativeBtoa = (globalThis as { btoa?: (input: string) => string }).btoa;
  if (typeof nativeBtoa !== 'function') {
    return base64StringFromByteArray(bytes);
  }

  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK_SIZE) as unknown as number[]);
  }
  return nativeBtoa(binary);
}
