import { _resetBase64EncoderForTesting, encodeToBase64 } from '../../src/js/utils/base64';

jest.mock(
  'react-native-quick-base64',
  () => ({
    __esModule: true,
    fromByteArray: jest.fn((bytes: Uint8Array) => `quick:${bytes.length}`),
  }),
  { virtual: true },
);

describe('encodeToBase64', () => {
  beforeEach(() => {
    _resetBase64EncoderForTesting();
    jest.resetModules();
  });

  test('uses react-native-quick-base64 when available', () => {
    // The module mock above provides a fake `fromByteArray` returning a sentinel.
    const result = encodeToBase64(new Uint8Array([0x73, 0x65, 0x6e, 0x74, 0x72, 0x79]));
    expect(result).toBe('quick:6');
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
});
