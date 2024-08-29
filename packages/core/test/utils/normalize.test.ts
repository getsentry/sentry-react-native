import { convertToNormalizedObject } from '../../src/js/utils/normalize';

describe('normalize', () => {
  describe('convertToNormalizedObject', () => {
    test('output equals input for normalized objects', () => {
      const actualResult = convertToNormalizedObject({ foo: 'bar' });
      expect(actualResult).toEqual({ foo: 'bar' });
    });

    test('converted output is normalized', () => {
      const actualResult = convertToNormalizedObject({ foo: NaN });
      expect(actualResult).toEqual({ foo: '[NaN]' });
    });

    test('converts a value to an object', () => {
      const actualResult = convertToNormalizedObject('foo');
      expect(actualResult).toEqual({ value: 'foo' });
    });

    test('converts null to an object', () => {
      const actualResult = convertToNormalizedObject(null);
      expect(actualResult).toEqual({ value: null });
    });

    test('converts array to an object', () => {
      const actualResult = convertToNormalizedObject([]);
      expect(actualResult).toEqual({ value: [] });
    });

    test('converts custom class to an object', () => {
      class TestClass {
        test: string = 'foo';
      }
      const actualResult = convertToNormalizedObject(new TestClass());
      expect(actualResult).toEqual({ test: 'foo' });
    });
  });
});
