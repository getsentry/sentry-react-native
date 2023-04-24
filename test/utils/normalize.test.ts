import { convertToNormalizedObject } from '../../src/js/utils/normalize';

describe('normalize', () => {
  describe('convertToRecord', () => {
    test('output equals input for normalized objects', () => {
      const actualResult = convertToNormalizedObject({ foo: 'bar' });
      expect(actualResult).toEqual({ foo: 'bar' });
    });

    test('converted output is normalized', () => {
      const actualResult = convertToNormalizedObject({ foo: undefined });
      expect(actualResult).toEqual({ foo: '[undefined]' });
    });

    test('converts a value to an object', () => {
      const actualResult = convertToNormalizedObject('foo');
      expect(actualResult).toEqual({ unknown: 'foo' });
    });
  });
});
