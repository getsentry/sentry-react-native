import { getMainCarrier, SDK_VERSION } from '@sentry/core';

import type { RN_GLOBAL_OBJ } from '../utils/worldwide';
import { utf8ToBytes } from '../vendor';

export const useEncodePolyfill = (): void => {
  const globalCarriers = getMainCarrier().__SENTRY__;

  if (!globalCarriers) {
    (globalCarriers as Partial<(typeof RN_GLOBAL_OBJ)['__SENTRY__']>) = {};
  }

  globalCarriers[SDK_VERSION].encodePolyfill = encodePolyfill;
};

export const encodePolyfill = (text: string): Uint8Array => {
  const bytes = new Uint8Array(utf8ToBytes(text));
  return bytes;
};
