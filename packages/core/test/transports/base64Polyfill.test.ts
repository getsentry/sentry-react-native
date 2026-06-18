import { SDK_VERSION } from '@sentry/core';

import { base64Polyfill, useBase64Polyfill } from '../../src/js/transports/base64Polyfill';
import { getSentryCarrier } from '../../src/js/utils/carrier';
import { RN_GLOBAL_OBJ } from '../../src/js/utils/worldwide';

describe('useBase64Polyfill', () => {
  afterEach(() => {
    const carrier = getSentryCarrier();
    delete carrier.base64Polyfill;
  });

  test('installs the default JS base64 polyfill on the carrier', () => {
    useBase64Polyfill();
    expect(RN_GLOBAL_OBJ.__SENTRY__?.[SDK_VERSION]?.base64Polyfill).toBe(base64Polyfill);
  });

  test('default polyfill encodes a byte array to a base64 string', () => {
    useBase64Polyfill();
    const encode = RN_GLOBAL_OBJ.__SENTRY__?.[SDK_VERSION]?.base64Polyfill;
    expect(encode).toBeDefined();
    // "sentry" => "c2VudHJ5"
    expect(encode!(new Uint8Array([0x73, 0x65, 0x6e, 0x74, 0x72, 0x79]))).toBe('c2VudHJ5');
  });
});
