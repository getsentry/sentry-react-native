import { getSentryCarrier } from '../utils/carrier';
import { RN_GLOBAL_OBJ } from '../utils/worldwide';
import { utf8ToBytes } from '../vendor';

export const useEncodePolyfill = (): void => {
  const carrier = getSentryCarrier();

  if (RN_GLOBAL_OBJ.TextEncoder) {
    // Hermes for RN 0.74 and later includes native TextEncoder
    // https://github.com/facebook/hermes/commit/8fb0496d426a8e50d00385148d5fb498a6daa312
    carrier.encodePolyfill = globalEncodeFactory(RN_GLOBAL_OBJ.TextEncoder);
  } else {
    carrier.encodePolyfill = encodePolyfill;
  }
};

/*
 * The default encode polyfill is available in Hermes for RN 0.74 and later.
 * https://github.com/facebook/hermes/commit/8fb0496d426a8e50d00385148d5fb498a6daa312
 */
export const globalEncodeFactory = (Encoder: EncoderClass) => (text: string) => new Encoder().encode(text);

type EncoderClass = Required<typeof RN_GLOBAL_OBJ>['TextEncoder'];

/*
 * Encode polyfill runs in JS and might cause performance issues when processing large payloads. (~2+ MB)
 */
export const encodePolyfill = (text: string): Uint8Array => {
  const bytes = new Uint8Array(utf8ToBytes(text));
  return bytes;
};
