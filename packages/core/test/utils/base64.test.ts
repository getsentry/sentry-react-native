import { encodeToBase64 } from '../../src/js/utils/base64';

describe('encodeToBase64', () => {
  test('encodes a small byte array correctly', () => {
    // "sentry" => "c2VudHJ5"
    expect(encodeToBase64(new Uint8Array([0x73, 0x65, 0x6e, 0x74, 0x72, 0x79]))).toBe('c2VudHJ5');
  });

  test('encodes a large byte array correctly (exercises chunked path)', () => {
    // 100,000 bytes — well past CHUNK_SIZE (0x8000 = 32,768) so we cross
    // multiple chunks. Compare against Node's reference Buffer encoding.
    const bytes = new Uint8Array(100_000);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = i % 256;
    }
    expect(encodeToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });

  test('falls back to the JS encoder when `btoa` is unavailable', () => {
    const originalBtoa = (globalThis as { btoa?: unknown }).btoa;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).btoa;
    try {
      // "sentry" => "c2VudHJ5"
      expect(encodeToBase64(new Uint8Array([0x73, 0x65, 0x6e, 0x74, 0x72, 0x79]))).toBe('c2VudHJ5');
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).btoa = originalBtoa;
    }
  });
});
