// Adapted from https://github.com/feross/buffer/blob/795bbb5bda1b39f1370ebd784bea6107b087e3a7/index.js#L1956

// The MIT License (MIT)

// Copyright (c) Feross Aboukhadijeh, and other contributors.

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

/* eslint-disable */

/**
 * Convert a string to a byte array
 */
export function utf8ToBytes(string: string, units?: number): number[] {
  units = units || Infinity;
  let codePoint;
  const length = string.length;
  let leadSurrogate = null;
  const bytes: number[] = [];

  for (let i = 0; i < length; ++i) {
    codePoint = string.charCodeAt(i);

    // is surrogate component
    if (codePoint > 0xd7ff && codePoint < 0xe000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xdbff) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xef, 0xbf, 0xbd);
          continue;
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xef, 0xbf, 0xbd);
          continue;
        }

        // valid lead
        leadSurrogate = codePoint;

        continue;
      }

      // 2 leads in a row
      if (codePoint < 0xdc00) {
        if ((units -= 3) > -1) bytes.push(0xef, 0xbf, 0xbd);
        leadSurrogate = codePoint;
        continue;
      }

      // valid surrogate pair
      codePoint = (((leadSurrogate - 0xd800) << 10) | (codePoint - 0xdc00)) + 0x10000;
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xef, 0xbf, 0xbd);
    }

    leadSurrogate = null;

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break;
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break;
      bytes.push((codePoint >> 0x6) | 0xc0, (codePoint & 0x3f) | 0x80);
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break;
      bytes.push((codePoint >> 0xc) | 0xe0, ((codePoint >> 0x6) & 0x3f) | 0x80, (codePoint & 0x3f) | 0x80);
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break;
      bytes.push(
        (codePoint >> 0x12) | 0xf0,
        ((codePoint >> 0xc) & 0x3f) | 0x80,
        ((codePoint >> 0x6) & 0x3f) | 0x80,
        (codePoint & 0x3f) | 0x80,
      );
    } else {
      throw new Error('Invalid code point');
    }
  }

  return bytes;
}
