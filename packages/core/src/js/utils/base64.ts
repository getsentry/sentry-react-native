import { debug } from '@sentry/core';

import { base64StringFromByteArray } from '../vendor';

type FromByteArray = (bytes: Uint8Array, urlSafe?: boolean) => string;

let cachedEncoder: FromByteArray | null = null;
let resolved = false;

/**
 * Resolves the base64 encoder once. If the optional peer dependency
 * `react-native-quick-base64` is installed, its native JSI encoder is used
 * (~10x faster than the pure-JS fallback). Otherwise the bundled JS encoder
 * from `vendor/base64-js` is used.
 *
 * The resolution is cached so the require cost is paid at most once.
 */
function resolveEncoder(): FromByteArray {
  if (resolved) {
    return cachedEncoder ?? base64StringFromByteArray;
  }
  resolved = true;

  try {
    // Optional peer dependency — only loaded if the consumer installed it.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, import/no-extraneous-dependencies
    const quickBase64 = require('react-native-quick-base64') as { fromByteArray?: FromByteArray };
    if (quickBase64 && typeof quickBase64.fromByteArray === 'function') {
      cachedEncoder = quickBase64.fromByteArray;
      debug.log('Using react-native-quick-base64 for envelope encoding.');
      return cachedEncoder;
    }
  } catch (_e) {
    // Not installed — fall through to JS encoder.
  }

  cachedEncoder = base64StringFromByteArray;
  return cachedEncoder;
}

/**
 * Encode a byte array to a base64 string. Prefers the native
 * `react-native-quick-base64` encoder when available, otherwise uses the
 * bundled JS implementation.
 */
export function encodeToBase64(input: Uint8Array): string {
  return resolveEncoder()(input);
}

/**
 * @internal Test helper. Resets the cached encoder so the next call re-resolves.
 */
export function _resetBase64EncoderForTesting(): void {
  cachedEncoder = null;
  resolved = false;
}
