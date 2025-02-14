import { RN_GLOBAL_OBJ } from '../utils/worldwide';
import { utf8ToBytes } from '../vendor';

export const useEncodePolyfill = (): void => {
  // TODO: Still required?
  if (!RN_GLOBAL_OBJ.__SENTRY__) {
    (RN_GLOBAL_OBJ.__SENTRY__ as Partial<(typeof RN_GLOBAL_OBJ)['__SENTRY__']>) = {};
  }

  // TODO: Should point to SDK dependency or latest dependency?
  RN_GLOBAL_OBJ.__SENTRY__['9.1.0'].encodePolyfill = encodePolyfill;
};

export const encodePolyfill = (text: string): Uint8Array => {
  const bytes = new Uint8Array(utf8ToBytes(text));
  return bytes;
};
