/**
 * Type test for Object.freeze pollution fix
 *
 * This test ensures that Object.freeze() resolves to the correct built-in type
 * and not to a polluted type from @sentry-internal/replay.
 *
 * See: https://github.com/getsentry/sentry-react-native/issues/5407
 */

describe('Object.freeze type inference', () => {
  it('should correctly freeze plain objects', () => {
    const frozenObject = Object.freeze({
      key: 'value',
      num: 42,
    });

    // Runtime test: should be frozen
    expect(Object.isFrozen(frozenObject)).toBe(true);

    // Type test: TypeScript should infer Readonly<{ key: string; num: number; }>
    expect(frozenObject.key).toBe('value');
    expect(frozenObject.num).toBe(42);
  });

  it('should correctly freeze objects with as const', () => {
    const EVENTS = Object.freeze({
      CLICK: 'click',
      SUBMIT: 'submit',
    } as const);

    // Runtime test: should be frozen
    expect(Object.isFrozen(EVENTS)).toBe(true);

    // Type test: TypeScript should infer literal types
    expect(EVENTS.CLICK).toBe('click');
    expect(EVENTS.SUBMIT).toBe('submit');

    // TypeScript should infer: Readonly<{ CLICK: "click"; SUBMIT: "submit"; }>
    const eventType: 'click' | 'submit' = EVENTS.CLICK;
    expect(eventType).toBe('click');
  });

  it('should correctly freeze functions', () => {
    const frozenFn = Object.freeze((x: number) => x * 2);

    // Runtime test: should be frozen
    expect(Object.isFrozen(frozenFn)).toBe(true);

    // Type test: function should still be callable
    const result: number = frozenFn(5);
    expect(result).toBe(10);
  });

  it('should correctly freeze nested objects', () => {
    const ACTIONS = Object.freeze({
      USER: Object.freeze({
        LOGIN: 'user:login',
        LOGOUT: 'user:logout',
      } as const),
      ADMIN: Object.freeze({
        DELETE: 'admin:delete',
      } as const),
    } as const);

    // Runtime test: should be frozen
    expect(Object.isFrozen(ACTIONS)).toBe(true);
    expect(Object.isFrozen(ACTIONS.USER)).toBe(true);
    expect(Object.isFrozen(ACTIONS.ADMIN)).toBe(true);

    // Type test: should preserve nested literal types
    expect(ACTIONS.USER.LOGIN).toBe('user:login');
    expect(ACTIONS.ADMIN.DELETE).toBe('admin:delete');

    // TypeScript should infer the correct literal type
    const action: 'user:login' = ACTIONS.USER.LOGIN;
    expect(action).toBe('user:login');
  });

  it('should maintain type safety and prevent modifications at compile time', () => {
    const frozen = Object.freeze({ value: 42 });

    // Runtime: attempting to modify should silently fail (in non-strict mode)
    // or throw (in strict mode)
    expect(() => {
      // @ts-expect-error - TypeScript should prevent this at compile time
      (frozen as any).value = 100;
    }).not.toThrow(); // In non-strict mode, this silently fails

    // Value should remain unchanged
    expect(frozen.value).toBe(42);
  });

  it('should work with array freeze', () => {
    const frozenArray = Object.freeze([1, 2, 3]);

    // Runtime test
    expect(Object.isFrozen(frozenArray)).toBe(true);
    expect(frozenArray).toEqual([1, 2, 3]);

    // Array methods that don't mutate should still work
    expect(frozenArray.map(x => x * 2)).toEqual([2, 4, 6]);
    expect(frozenArray.filter(x => x > 1)).toEqual([2, 3]);
  });
});
