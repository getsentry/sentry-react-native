import { isExpoFetchEnabled } from '../../src/js/utils/environment';

describe('isExpoFetchEnabled', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      delete (globalThis as Partial<typeof globalThis>).fetch;
    }
  });

  it('returns false when globalThis.fetch is undefined', () => {
    delete (globalThis as Partial<typeof globalThis>).fetch;
    expect(isExpoFetchEnabled()).toBe(false);
  });

  it('returns false when globalThis.fetch is a plain function without expo.builtin symbol', () => {
    globalThis.fetch = jest.fn() as unknown as typeof fetch;
    expect(isExpoFetchEnabled()).toBe(false);
  });

  it('returns true when globalThis.fetch has the expo.builtin symbol', () => {
    const expoFetch = jest.fn() as unknown as typeof fetch;
    Object.defineProperty(expoFetch, Symbol.for('expo.builtin'), {
      value: true,
      enumerable: false,
      configurable: false,
    });
    globalThis.fetch = expoFetch;
    expect(isExpoFetchEnabled()).toBe(true);
  });

  it('returns false when expo.builtin symbol is present but not true', () => {
    const expoFetch = jest.fn() as unknown as typeof fetch;
    Object.defineProperty(expoFetch, Symbol.for('expo.builtin'), {
      value: false,
      enumerable: false,
      configurable: false,
    });
    globalThis.fetch = expoFetch;
    expect(isExpoFetchEnabled()).toBe(false);
  });
});
