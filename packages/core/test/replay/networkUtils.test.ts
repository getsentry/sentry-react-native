import {
  decodeUtf8,
  getBodySize,
  isTextLikeContentType,
  parseContentLengthHeader,
  readBlobAsText,
} from '../../src/js/replay/networkUtils';

describe('networkUtils', () => {
  describe('parseContentLengthHeader()', () => {
    it.each([
      [undefined, undefined],
      [null, undefined],
      ['', undefined],
      ['12', 12],
      ['abc', undefined],
    ])('works with %s header value', (headerValue, size) => {
      expect(parseContentLengthHeader(headerValue)).toBe(size);
    });
  });

  describe('getBodySize()', () => {
    it('works with empty body', () => {
      expect(getBodySize(undefined)).toBe(undefined);
      expect(getBodySize(null)).toBe(undefined);
      expect(getBodySize('')).toBe(undefined);
    });

    it('works with string body', () => {
      expect(getBodySize('abcd')).toBe(4);
      // Emojis are correctly counted as mutliple characters
      expect(getBodySize('With emoji: 😈')).toBe(16);
    });

    it('works with URLSearchParams', () => {
      const params = new URLSearchParams();
      params.append('name', 'Jane');
      params.append('age', '42');
      params.append('emoji', '😈');

      expect(getBodySize(params)).toBe(35);
    });

    it('works with FormData', () => {
      const formData = new FormData();
      formData.append('name', 'Jane');
      formData.append('age', '42');
      formData.append('emoji', '😈');

      expect(getBodySize(formData)).toBe(35);
    });

    it('works with Blob', () => {
      const blob = new Blob(['<html>Hello world: 😈</html>'], { type: 'text/html', lastModified: 0 });

      expect(getBodySize(blob)).toBe(30);
    });

    it('works with ArrayBuffer', () => {
      const arrayBuffer = new ArrayBuffer(8);

      expect(getBodySize(arrayBuffer)).toBe(8);
    });
  });

  describe('isTextLikeContentType()', () => {
    it.each([
      ['application/json', true],
      ['application/json; charset=utf-8', true],
      ['application/hal+json', true],
      ['text/plain', true],
      ['text/html; charset=utf-8', true],
      ['application/xml', true],
      ['image/svg+xml', true],
      ['application/x-www-form-urlencoded', true],
      ['APPLICATION/JSON', true],
      ['image/png', false],
      ['application/octet-stream', false],
      ['video/mp4', false],
      ['', false],
      [null, false],
      [undefined, false],
    ])('classifies %s as %s', (contentType, expected) => {
      expect(isTextLikeContentType(contentType)).toBe(expected);
    });
  });

  describe('decodeUtf8()', () => {
    const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

    it('decodes ASCII and multi-byte characters via TextDecoder when available', () => {
      expect(decodeUtf8(encode('{"ok":true}'))).toBe('{"ok":true}');
      expect(decodeUtf8(encode('Привет 你好 🎉'))).toBe('Привет 你好 🎉');
    });

    describe('without TextDecoder (Hermes)', () => {
      let originalTextDecoder: unknown;

      beforeEach(() => {
        originalTextDecoder = (globalThis as { TextDecoder?: unknown }).TextDecoder;
        delete (globalThis as { TextDecoder?: unknown }).TextDecoder;
      });

      afterEach(() => {
        (globalThis as { TextDecoder?: unknown }).TextDecoder = originalTextDecoder;
      });

      it('decodes ASCII and multi-byte characters with the manual decoder', () => {
        expect(decodeUtf8(encode('{"ok":true}'))).toBe('{"ok":true}');
        expect(decodeUtf8(encode('Привет 你好 🎉'))).toBe('Привет 你好 🎉');
      });

      it('replaces invalid sequences with U+FFFD instead of throwing', () => {
        expect(decodeUtf8(new Uint8Array([0x61, 0xff, 0x62]))).toBe('a�b');
        // multi-byte sequence truncated at the end of the buffer
        expect(decodeUtf8(new Uint8Array([0x61, 0xd0]))).toBe('a�');
        // truncated sequence with a valid continuation prefix yields one U+FFFD
        expect(decodeUtf8(new Uint8Array([0x61, 0xe2, 0x82]))).toBe('a�');
      });

      it('does not drop bytes that follow an interrupted multi-byte sequence', () => {
        // lead byte followed by a non-continuation byte: the tail is kept
        expect(decodeUtf8(new Uint8Array([0xe2, 0x41, 0x42]))).toBe('�AB');
        // valid continuation prefix, then interrupted: one U+FFFD, tail kept
        expect(decodeUtf8(new Uint8Array([0xe2, 0x82, 0x41]))).toBe('�A');
      });
    });
  });

  describe('readBlobAsText()', () => {
    afterEach(() => {
      delete (globalThis as { FileReader?: unknown }).FileReader;
      jest.useRealTimers();
    });

    it('resolves with the blob content', async () => {
      installMockFileReader();
      await expect(readBlobAsText(new Blob(['{"ok":true}']), 500)).resolves.toBe('{"ok":true}');
    });

    it('rejects when the reader errors', async () => {
      installMockFileReader({ failWith: new Error('read failed') });
      await expect(readBlobAsText(new Blob(['x']), 500)).rejects.toThrow('read failed');
    });

    it('rejects after the timeout when the reader never completes', async () => {
      jest.useFakeTimers();
      installMockFileReader({ neverComplete: true });
      const promise = readBlobAsText(new Blob(['x']), 500);
      const assertion = expect(promise).rejects.toThrow('Timed out');
      jest.advanceTimersByTime(500);
      await assertion;
    });
  });
});

function installMockFileReader(behavior: { failWith?: Error; neverComplete?: boolean } = {}): void {
  class MockFileReader {
    public result: string | null = null;
    public error: Error | null = null;
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
    public onabort: (() => void) | null = null;

    public readAsText(blob: Blob): void {
      if (behavior.neverComplete) {
        return;
      }
      if (behavior.failWith) {
        this.error = behavior.failWith;
        queueMicrotask(() => this.onerror?.());
        return;
      }
      blob.text().then(
        text => {
          this.result = text;
          this.onload?.();
        },
        (error: Error) => {
          this.error = error;
          this.onerror?.();
        },
      );
    }

    public abort(): void {
      // match the browser behaviour of firing onabort asynchronously-ish;
      // readBlobAsText has already rejected by the time this runs
      this.onabort?.();
    }
  }
  (globalThis as { FileReader?: unknown }).FileReader = MockFileReader;
}
