import { safeFactory, safeTracesSampler } from '../../src/js/utils/safe';

describe('safe', () => {
  describe('safeFactory', () => {
    test('calls given function with correct args', () => {
      const mockFn = jest.fn();
      const actualSafeFunction = safeFactory(mockFn);
      actualSafeFunction('foo', 'bar');
      expect(mockFn).toBeCalledTimes(1);
      expect(mockFn).toBeCalledWith('foo', 'bar');
    });
    test('calls given function amd return its result', () => {
      const mockFn = jest.fn(() => 'bar');
      const actualSafeFunction = safeFactory(mockFn);
      const actualResult = actualSafeFunction('foo');
      expect(mockFn).toBeCalledTimes(1);
      expect(actualResult).toBe('bar');
    });
    test('passes undefined trough', () => {
      const actualSafeFunction = safeFactory(undefined);
      expect(actualSafeFunction).not.toBeDefined();
    });
    test('passes object trough', () => {
      const actualSafeFunction = safeFactory({ foo: 'bar' });
      expect(actualSafeFunction).toEqual({ foo: 'bar' });
    });
    test('returns input object if function failed', () => {
      const mockFn = jest.fn(() => {
        throw 'Test error';
      });
      const actualSafeFunction = safeFactory(<(foo: string) => string>mockFn);
      const actualResult = actualSafeFunction('foo');
      expect(mockFn).toBeCalledTimes(1);
      expect(actualResult).toEqual('foo');
    });
  });
  describe('safeTracesSampler', () => {
    test('calls given function with correct args', () => {
      const mockFn = jest.fn();
      const actualSafeFunction = safeTracesSampler(mockFn);
      actualSafeFunction?.({ transactionContext: { name: 'foo' } });
      expect(mockFn).toBeCalledTimes(1);
      expect(mockFn).toBeCalledWith({ transactionContext: { name: 'foo' } });
    });
    test('calls given function amd return its result', () => {
      const mockFn = jest.fn(() => 0.5);
      const actualSafeFunction = safeTracesSampler(mockFn);
      const actualResult = actualSafeFunction?.({ transactionContext: { name: 'foo' } });
      expect(mockFn).toBeCalledTimes(1);
      expect(actualResult).toBe(0.5);
    });
    test('passes undefined trough', () => {
      const actualSafeFunction = safeTracesSampler(undefined);
      expect(actualSafeFunction).not.toBeDefined();
    });
    test('returns input object if function failed', () => {
      const mockFn = jest.fn(() => {
        throw 'Test error';
      });
      const actualSafeFunction = safeTracesSampler(mockFn);
      const actualResult = actualSafeFunction?.({ transactionContext: { name: 'foo' } });
      expect(mockFn).toBeCalledTimes(1);
      expect(actualResult).toEqual(0);
    });
  });
});
