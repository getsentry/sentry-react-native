import { utf8ToBytes } from '../../../src/js/vendor';

describe('Buffer utf8 tests - size', () => {
  test('should return the correct size in bytes', () => {
    expect(utf8ToBytes('🥔').length).toEqual(4);
  });
});
