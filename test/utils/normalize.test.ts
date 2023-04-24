import { convertToRecord } from '../../src/js/utils/normalize';

describe('normalize', () => {
  describe('convertToRecord', () => {
    test('output equals input for normalized objects', () => {
      const actualResult = convertToRecord({ foo: 'bar' });
      expect(actualResult).toEqual({ foo: 'bar' });
    });

    test('converted output is normalized', () => {
      const actualResult = convertToRecord({ foo: undefined });
      expect(actualResult).toEqual({ foo: '[undefined]' });
    });

    test('converts a value to an object', () => {
      const actualResult = convertToRecord('foo');
      expect(actualResult).toEqual({ unknown: 'foo' });
    });
  });
});
