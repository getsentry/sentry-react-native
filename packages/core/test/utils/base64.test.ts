import { _resetBase64EncoderForTesting, encodeToBase64 } from '../../src/js/utils/base64';

const quickFromByteArray = jest.fn((bytes: Uint8Array) => Buffer.from(bytes).toString('base64'));

jest.mock(
  'react-native-quick-base64',
  () => ({
    __esModule: true,
    fromByteArray: quickFromByteArray,
  }),
  { virtual: true },
);

describe('encodeToBase64', () => {
  beforeEach(() => {
    _resetBase64EncoderForTesting();
    quickFromByteArray.mockClear();
    jest.resetModules();
  });

  test('uses react-native-quick-base64 when available', () => {
    // "sentry" => "c2VudHJ5"
    const result = encodeToBase64(new Uint8Array([0x73, 0x65, 0x6e, 0x74, 0x72, 0x79]));
    expect(result).toBe('c2VudHJ5');
    // Probe call during resolution + the actual encode call.
    expect(quickFromByteArray).toHaveBeenCalledTimes(2);
    expect(quickFromByteArray).toHaveBeenLastCalledWith(new Uint8Array([0x73, 0x65, 0x6e, 0x74, 0x72, 0x79]));
  });

  test('falls back to the JS encoder when react-native-quick-base64 is not installed', () => {
    jest.isolateModules(() => {
      jest.doMock(
        'react-native-quick-base64',
        () => {
          throw new Error('Cannot find module');
        },
        { virtual: true },
      );
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const {
        encodeToBase64: isolatedEncode,
        _resetBase64EncoderForTesting: isolatedReset,
      } = require('../../src/js/utils/base64');
      isolatedReset();
      // "sentry" => "c2VudHJ5"
      expect(isolatedEncode(new Uint8Array([0x73, 0x65, 0x6e, 0x74, 0x72, 0x79]))).toBe('c2VudHJ5');
    });
  });

  test('falls back to the JS encoder when the native binding throws on probe', () => {
    jest.isolateModules(() => {
      const brokenFromByteArray = jest.fn(() => {
        throw new Error('native module not linked');
      });
      jest.doMock('react-native-quick-base64', () => ({ __esModule: true, fromByteArray: brokenFromByteArray }), {
        virtual: true,
      });
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const {
        encodeToBase64: isolatedEncode,
        _resetBase64EncoderForTesting: isolatedReset,
      } = require('../../src/js/utils/base64');
      isolatedReset();
      expect(isolatedEncode(new Uint8Array([0x73, 0x65, 0x6e, 0x74, 0x72, 0x79]))).toBe('c2VudHJ5');
      // Probe was attempted exactly once; the broken binding is not used for the real encode.
      expect(brokenFromByteArray).toHaveBeenCalledTimes(1);
    });
  });
});
