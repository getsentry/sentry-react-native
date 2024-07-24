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

import { utf8ToBytes } from '../../../src/js/vendor';

describe('Buffer utf8 tests', () => {
  const testCases = [
    'ﾟ･✿ヾ╲(｡◕‿◕｡)╱✿･ﾟ',
    '𝌆',
    '🐵 🙈 🙉 🙊',
    '💩',
    'åß∂ƒ©˙∆˚¬…æ',
    'Hello, World!',
    'Powerلُلُصّبُلُلصّبُررً ॣ ॣh ॣ ॣ冗',
    '𝕿𝖍𝖊 𝖖𝖚𝖎𝖈𝖐 𝖇𝖗𝖔𝖜𝖓 𝖋𝖔𝖝 𝖏𝖚𝖒𝖕𝖘 𝖔𝖛𝖊𝖗 𝖙𝖍𝖊 𝖑𝖆𝖟𝖞 𝖉𝖔𝖌',
    '사회과학원 어학연구소',
  ];

  const badStrings = [
    {
      input: 'abc123',
      expected: [0x61, 0x62, 0x63, 0x31, 0x32, 0x33],
      name: 'Sanity check',
    },
    {
      input: '\uD800',
      expected: [0xef, 0xbf, 0xbd],
      name: 'Surrogate half (low)',
    },
    {
      input: '\uDC00',
      expected: [0xef, 0xbf, 0xbd],
      name: 'Surrogate half (high)',
    },
    {
      input: 'abc\uD800123',
      expected: [0x61, 0x62, 0x63, 0xef, 0xbf, 0xbd, 0x31, 0x32, 0x33],
      name: 'Surrogate half (low), in a string',
    },
    {
      input: 'abc\uDC00123',
      expected: [0x61, 0x62, 0x63, 0xef, 0xbf, 0xbd, 0x31, 0x32, 0x33],
      name: 'Surrogate half (high), in a string',
    },
    {
      input: '\uDC00\uD800',
      expected: [0xef, 0xbf, 0xbd, 0xef, 0xbf, 0xbd],
      name: 'Wrong order',
    },
  ];

  describe('test strings', () => {
    for (const input of testCases) {
      it(`should encode "${input}"`, () => {
        // @ts-expect-error The test run in node where Buffer is available
        const actual = Buffer.from(utf8ToBytes(input));
        // @ts-expect-error The test run in node where Buffer is available
        const expected = Buffer.from(input, 'utf8');

        expect(actual).toEqual(expected);
      });
    }
  });

  describe('web platform test', () => {
    for (const testCase of badStrings) {
      it(testCase.name, () => {
        const actual = Array.from(new Uint8Array(utf8ToBytes(testCase.input)));

        expect(actual).toEqual(testCase.expected);
      });
    }
  });
});
