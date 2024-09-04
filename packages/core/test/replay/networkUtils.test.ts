import { getBodySize, parseContentLengthHeader } from '../../src/js/replay/networkUtils';

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
});
