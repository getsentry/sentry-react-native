import { getMainCarrier, SDK_VERSION } from '@sentry/core';

import { utf8ToBytes } from '../vendor';

export const useEncodePolyfill = (): void => {
  // Based on https://github.com/getsentry/sentry-javascript/blob/f0fc41f6166857cd97a695f5cc9a18caf6a0bf43/packages/core/src/carrier.ts#L49
  const carrier = getMainCarrier();
  const __SENTRY__ = (carrier.__SENTRY__ = carrier.__SENTRY__ || {});
  (__SENTRY__[SDK_VERSION] = __SENTRY__[SDK_VERSION] || {}).encodePolyfill = encodePolyfill;
};

export const encodePolyfill = (text: string): Uint8Array => {
  const bytes = new Uint8Array(utf8ToBytes(text));
  return bytes;
};
