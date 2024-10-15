import { isErrorLike } from '../src/js/utils/error';

describe('error', () => {
  describe('isErrorLike', () => {
    test('returns true for Error object', () => {
      expect(isErrorLike(new Error('test'))).toBe(true);
    });

    test('returns true for ErrorLike object', () => {
      expect(isErrorLike({ stack: 'test' })).toBe(true);
    });

    test('returns false for non object', () => {
      expect(isErrorLike('test')).toBe(false);
    });

    test('returns false for object without stack', () => {
      expect(isErrorLike({})).toBe(false);
    });

    test('returns false for object with non string stack', () => {
      expect(isErrorLike({ stack: 1 })).toBe(false);
    });
  });
});
