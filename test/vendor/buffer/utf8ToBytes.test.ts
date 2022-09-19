import { utf8ToBytes } from '../../../src/js/vendor';

/**
 * These test are taken over from encode-utf8 library to test the utf8ToBytes function
 *
 * https://github.com/LinusU/encode-utf8/blob/9c112ab99827e07667f9a349ca5498157479f68e/test.js
 *
 * License: MIT (https://github.com/LinusU/encode-utf8)
 */
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
    '사회과학원 어학연구소'
  ];

  const badStrings = [
    {
      input: 'abc123',
      expected: [0x61, 0x62, 0x63, 0x31, 0x32, 0x33],
      name: 'Sanity check'
    },
    {
      input: '\uD800',
      expected: [0xef, 0xbf, 0xbd],
      name: 'Surrogate half (low)'
    },
    {
      input: '\uDC00',
      expected: [0xef, 0xbf, 0xbd],
      name: 'Surrogate half (high)'
    },
    {
      input: 'abc\uD800123',
      expected: [0x61, 0x62, 0x63, 0xef, 0xbf, 0xbd, 0x31, 0x32, 0x33],
      name: 'Surrogate half (low), in a string'
    },
    {
      input: 'abc\uDC00123',
      expected: [0x61, 0x62, 0x63, 0xef, 0xbf, 0xbd, 0x31, 0x32, 0x33],
      name: 'Surrogate half (high), in a string'
    },
    {
      input: '\uDC00\uD800',
      expected: [0xef, 0xbf, 0xbd, 0xef, 0xbf, 0xbd],
      name: 'Wrong order'
    }
  ];

  describe('test strings', () => {
    for (const input of testCases) {
      it(`should encode "${input}"`, () => {
        // @ts-ignore The test run in node where Buffer is available
        const actual = Buffer.from(utf8ToBytes(input))
        // @ts-ignore The test run in node where Buffer is available
        const expected = Buffer.from(input, 'utf8')

        expect(actual).toEqual(expected);
      })
    }
  })

  describe('web platform test', () => {
    for (const testCase of badStrings) {
      it(testCase.name, () => {
        const actual = Array.from(new Uint8Array(utf8ToBytes(testCase.input)))

        expect(actual).toEqual(testCase.expected);
      })
    }
  })
});
