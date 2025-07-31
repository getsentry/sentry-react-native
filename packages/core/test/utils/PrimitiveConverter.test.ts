import { PrimitiveToString } from '../../src/js/utils/primitiveConverter';

describe('Primitive to String', () => {
  it('Doesnt change strings', () => {
    expect(PrimitiveToString('1234')).toBe('1234');
    expect(PrimitiveToString('1234,1')).toBe('1234,1');
    expect(PrimitiveToString('abc')).toBe('abc');
  });

  it('Converts boolean to uppercase', () => {
    expect(PrimitiveToString(false)).toBe('False');
    expect(PrimitiveToString(true)).toBe('True');
  });

  it('Keeps undefined', () => {
    expect(PrimitiveToString(undefined)).toBeUndefined();
  });

  it('Converts null to empty', () => {
    expect(PrimitiveToString(null)).toBe('');
  });

  test.each([
    [0, '0'],
    [1, '1'],
    [12345, '12345'],
    [Number.MIN_VALUE, `${Number.MIN_VALUE}`],
    [Number.MAX_VALUE, `${Number.MAX_VALUE}`],
    [Number.MIN_SAFE_INTEGER, `${Number.MIN_SAFE_INTEGER}`],
    [Number.MAX_SAFE_INTEGER, `${Number.MAX_SAFE_INTEGER}`],
  ])('Converts %p to "%s"', (input, expected) => {
    expect(PrimitiveToString(input)).toBe(expected);
  });

  test.each([
    [BigInt('0'), '0'],
    [BigInt('1'), '1'],
    [BigInt('-1'), '-1'],
    [BigInt('123456789012345678901234567890'), '123456789012345678901234567890'],
    [BigInt('-98765432109876543210987654321'), '-98765432109876543210987654321'],
  ])('converts bigint %p to "%s"', (input, expected) => {
    expect(PrimitiveToString(input)).toBe(expected);
  });

  it('Symbol to String', () => {
    const symbol = Symbol('a symbol');
    expect(PrimitiveToString(symbol)).toBe('Symbol(a symbol)');
  });
});
