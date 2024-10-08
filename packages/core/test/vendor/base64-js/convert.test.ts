// The MIT License (MIT)

// Copyright (c) 2014 Jameson Little

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

// Adapted from https://github.dev/beatgammit/base64-js/blob/88957c9943c7e2a0f03cdf73e71d579e433627d3/test/convert.js#L15

import { base64StringFromByteArray } from '../../../src/js/vendor';

describe('base64-js', () => {
  const checks = ['a', 'aa', 'aaa', 'hi', 'hi!', 'hi!!', 'sup', 'sup?', 'sup?!'];

  test('convert to base64 and back', () => {
    for (const check of checks) {
      const b64Str = base64StringFromByteArray(
        map(check, function (char: string) {
          return char.charCodeAt(0);
        }),
      );

      const str = Buffer.from(b64Str, 'base64').toString();

      expect(check).toEqual(str);
    }
  });

  const data: [number[], string][] = [
    [[0, 0, 0], 'AAAA'],
    [[0, 0, 1], 'AAAB'],
    [[0, 1, -1], 'AAH/'],
    [[1, 1, 1], 'AQEB'],
    [[0, -73, 23], 'ALcX'],
  ];

  test('convert known data to string', () => {
    for (const check of data) {
      const bytes = check[0];
      const expected = check[1];
      const actual = base64StringFromByteArray(bytes);
      expect(actual).toEqual(expected);
    }
  });

  function map(arr: string, callback: (char: string) => number): number[] {
    const res = [];
    let kValue, mappedValue;

    for (let k = 0, len = arr.length; k < len; k++) {
      if (typeof arr === 'string' && !!arr.charAt(k)) {
        kValue = arr.charAt(k);
        mappedValue = callback(kValue);
        res[k] = mappedValue;
      } else if (typeof arr !== 'string' && k in arr) {
        kValue = arr[k];
        mappedValue = callback(kValue);
        res[k] = mappedValue;
      }
    }
    return res;
  }
});
