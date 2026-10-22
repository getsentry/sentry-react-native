import { isExpoFetchEnabled, isResourceTimingSupported } from '../../src/js/utils/environment';
import { ReactNativeLibraries } from '../../src/js/utils/rnlibraries';

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

describe('isResourceTimingSupported', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    [0, 83],
    [0, 87],
    [1, 0],
  ])('returns true on React Native %i.%i', (major, minor) => {
    jest.replaceProperty(ReactNativeLibraries, 'ReactNativeVersion', { version: { major, minor, patch: 0 } });

    expect(isResourceTimingSupported()).toBe(true);
  });

  it.each([
    [0, 80],
    [0, 81],
    [0, 82],
  ])('returns false on React Native %i.%i', (major, minor) => {
    jest.replaceProperty(ReactNativeLibraries, 'ReactNativeVersion', { version: { major, minor, patch: 0 } });

    expect(isResourceTimingSupported()).toBe(false);
  });

  it('returns false when the React Native version is unknown', () => {
    jest.replaceProperty(ReactNativeLibraries, 'ReactNativeVersion', { version: undefined });

    expect(isResourceTimingSupported()).toBe(false);
  });
});
