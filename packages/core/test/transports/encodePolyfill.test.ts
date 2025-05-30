import { SDK_VERSION } from '@sentry/core';
import { encodePolyfill, globalEncodeFactory, useEncodePolyfill } from '../../src/js/transports/encodePolyfill';
import { RN_GLOBAL_OBJ } from '../../src/js/utils/worldwide';

const OriginalTextEncoder = RN_GLOBAL_OBJ.TextEncoder;

const restoreTextEncoder = (): void => {
  RN_GLOBAL_OBJ.TextEncoder = OriginalTextEncoder;
};

describe('useEncodePolyfill', () => {
  afterEach(() => {
    restoreTextEncoder();
  });

  test('should use global encode factory if TextEncoder is available', () => {
    RN_GLOBAL_OBJ.TextEncoder = MockedTextEncoder;
    useEncodePolyfill();
    expect(RN_GLOBAL_OBJ.__SENTRY__?.[SDK_VERSION]?.encodePolyfill?.('')).toEqual(new Uint8Array([1, 2, 3]));
  });

  test('should use encode polyfill if TextEncoder is not available', () => {
    RN_GLOBAL_OBJ.TextEncoder = undefined;
    useEncodePolyfill();
    expect(RN_GLOBAL_OBJ.__SENTRY__?.[SDK_VERSION]?.encodePolyfill).toBe(encodePolyfill);
  });
});

class MockedTextEncoder {
  public encode(_text: string): Uint8Array {
    return new Uint8Array([1, 2, 3]);
  }
}
