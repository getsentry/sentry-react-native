import { debug } from '@sentry/core';
import { NativeModules } from 'react-native';

import { wrapAllNativeModules } from '../../src/js/turbomodule/wrapNativeModules';
import * as wrapTurboModuleMod from '../../src/js/turbomodule/wrapTurboModule';
import { _resetWrappedModules } from '../../src/js/turbomodule/wrapTurboModule';
import * as environment from '../../src/js/utils/environment';

describe('wrapAllNativeModules', () => {
  let originalDescriptors: Record<string, PropertyDescriptor>;

  beforeEach(() => {
    _resetWrappedModules();
    jest.restoreAllMocks();
    originalDescriptors = Object.getOwnPropertyDescriptors(NativeModules);
  });

  afterEach(() => {
    // Restore NativeModules to its exact pre-test shape. Tests not only add keys,
    // they also overwrite existing ones (`Timing`, `UIManager`, ...) and
    // `wrapAllNativeModules` itself re-defines property descriptors when arming
    // lazy modules — all of which would otherwise leak into later tests.
    // `getOwnPropertyNames` (not `Object.keys`) because one test mocks
    // `Object.keys` and non-enumerable entries must be cleared too.
    for (const key of Object.getOwnPropertyNames(NativeModules)) {
      if (Object.getOwnPropertyDescriptor(NativeModules, key)?.configurable) {
        // oxlint-disable-next-line typescript-eslint(no-dynamic-delete)
        delete (NativeModules as Record<string, unknown>)[key];
      }
    }
    Object.defineProperties(NativeModules, originalDescriptors);
  });

  it('is a no-op on the New Architecture', () => {
    jest.spyOn(environment, 'isTurboModuleEnabled').mockReturnValue(true);
    const spy = jest.spyOn(wrapTurboModuleMod, 'wrapTurboModule');

    const wrapped = wrapAllNativeModules();

    expect(wrapped).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('wraps every legacy module with arch: legacy on the Old Architecture', () => {
    jest.spyOn(environment, 'isTurboModuleEnabled').mockReturnValue(false);
    const spy = jest.spyOn(wrapTurboModuleMod, 'wrapTurboModule');

    (NativeModules as Record<string, unknown>).LegacyA = { doWork: jest.fn() };
    (NativeModules as Record<string, unknown>).LegacyB = { ping: jest.fn() };

    const wrapped = wrapAllNativeModules();

    expect(wrapped).toEqual(expect.arrayContaining(['LegacyA', 'LegacyB']));
    expect(spy).toHaveBeenCalledWith('LegacyA', expect.any(Object), expect.objectContaining({ arch: 'legacy' }));
    expect(spy).toHaveBeenCalledWith('LegacyB', expect.any(Object), expect.objectContaining({ arch: 'legacy' }));
  });

  it('skips RNSentry implicitly — the integration wraps it with a curated skip list', () => {
    jest.spyOn(environment, 'isTurboModuleEnabled').mockReturnValue(false);
    const spy = jest.spyOn(wrapTurboModuleMod, 'wrapTurboModule');

    (NativeModules as Record<string, unknown>).RNSentry = { crash: jest.fn() };

    wrapAllNativeModules();

    expect(spy).not.toHaveBeenCalledWith('RNSentry', expect.anything(), expect.anything());
  });

  it('honours caller-supplied skipModules and per-module skipMethodsPerModule', () => {
    jest.spyOn(environment, 'isTurboModuleEnabled').mockReturnValue(false);
    const spy = jest.spyOn(wrapTurboModuleMod, 'wrapTurboModule');

    (NativeModules as Record<string, unknown>).SkipMe = { foo: jest.fn() };
    (NativeModules as Record<string, unknown>).WrapMe = { keep: jest.fn(), drop: jest.fn() };

    wrapAllNativeModules({
      skipModules: ['SkipMe'],
      skipMethodsPerModule: { WrapMe: ['drop'] },
    });

    expect(spy).not.toHaveBeenCalledWith('SkipMe', expect.anything(), expect.anything());
    expect(spy).toHaveBeenCalledWith(
      'WrapMe',
      expect.any(Object),
      expect.objectContaining({ arch: 'legacy', skip: ['drop'] }),
    );
  });

  it('tolerates entries whose value is null or not an object', () => {
    jest.spyOn(environment, 'isTurboModuleEnabled').mockReturnValue(false);
    const spy = jest.spyOn(wrapTurboModuleMod, 'wrapTurboModule');

    (NativeModules as Record<string, unknown>).NullMod = null;
    (NativeModules as Record<string, unknown>).StringMod = 'not a module';
    (NativeModules as Record<string, unknown>).RealMod = { work: jest.fn() };

    const wrapped = wrapAllNativeModules();

    expect(wrapped).not.toContain('NullMod');
    expect(wrapped).not.toContain('StringMod');
    expect(wrapped).toContain('RealMod');
    expect(spy).toHaveBeenCalledWith('RealMod', expect.any(Object), expect.objectContaining({ arch: 'legacy' }));
  });

  describe('lazy modules', () => {
    it('does not initialise a lazily-exposed module during setup', () => {
      jest.spyOn(environment, 'isTurboModuleEnabled').mockReturnValue(false);
      const spy = jest.spyOn(wrapTurboModuleMod, 'wrapTurboModule');
      const load = jest.fn(() => ({ doWork: jest.fn() }));
      defineLazy('LazyMod', load);

      const wrapped = wrapAllNativeModules();

      // Arming must not read through RN's lazy getter — doing so would eagerly
      // initialise every native module at Sentry.init.
      expect(load).not.toHaveBeenCalled();
      expect(spy).not.toHaveBeenCalledWith('LazyMod', expect.anything(), expect.anything());
      expect(wrapped).toContain('LazyMod');
    });

    it('wraps a lazily-exposed module on first access', () => {
      jest.spyOn(environment, 'isTurboModuleEnabled').mockReturnValue(false);
      const spy = jest.spyOn(wrapTurboModuleMod, 'wrapTurboModule');
      const instance = { doWork: jest.fn() };
      const load = jest.fn(() => instance);
      defineLazy('LazyMod', load);

      wrapAllNativeModules();
      const resolved = (NativeModules as Record<string, unknown>).LazyMod;

      expect(load).toHaveBeenCalledTimes(1);
      expect(resolved).toBe(instance);
      expect(spy).toHaveBeenCalledWith('LazyMod', instance, expect.objectContaining({ arch: 'legacy' }));
    });

    it('caches the resolved module so repeated reads do not re-enter the getter', () => {
      jest.spyOn(environment, 'isTurboModuleEnabled').mockReturnValue(false);
      const load = jest.fn(() => ({ doWork: jest.fn() }));
      defineLazy('LazyMod', load);

      wrapAllNativeModules();
      const first = (NativeModules as Record<string, unknown>).LazyMod;
      const second = (NativeModules as Record<string, unknown>).LazyMod;

      expect(load).toHaveBeenCalledTimes(1);
      expect(second).toBe(first);
      expect(Object.getOwnPropertyDescriptor(NativeModules, 'LazyMod')?.get).toBeUndefined();
    });

    it('keeps assignment working through the armed property', () => {
      jest.spyOn(environment, 'isTurboModuleEnabled').mockReturnValue(false);
      const load = jest.fn(() => ({ doWork: jest.fn() }));
      defineLazy('LazyMod', load);

      wrapAllNativeModules();
      const replacement = { other: jest.fn() };
      (NativeModules as Record<string, unknown>).LazyMod = replacement;

      expect((NativeModules as Record<string, unknown>).LazyMod).toBe(replacement);
      expect(load).not.toHaveBeenCalled();
    });

    it('propagates an error thrown by the underlying lazy getter', () => {
      jest.spyOn(environment, 'isTurboModuleEnabled').mockReturnValue(false);
      const load = jest.fn(() => {
        throw new Error('native module failed to load');
      });
      defineLazy('BrokenMod', load);

      wrapAllNativeModules();

      expect(() => (NativeModules as Record<string, unknown>).BrokenMod).toThrow('native module failed to load');
    });
  });

  it('skips hot React Native infrastructure modules by default', () => {
    jest.spyOn(environment, 'isTurboModuleEnabled').mockReturnValue(false);
    const spy = jest.spyOn(wrapTurboModuleMod, 'wrapTurboModule');

    for (const name of ['Timing', 'UIManager', 'NativeAnimatedModule', 'NativeAnimatedTurboModule']) {
      (NativeModules as Record<string, unknown>)[name] = { createTimer: jest.fn(), doWork: jest.fn() };
    }

    const wrapped = wrapAllNativeModules();

    for (const name of ['Timing', 'UIManager', 'NativeAnimatedModule', 'NativeAnimatedTurboModule']) {
      expect(wrapped).not.toContain(name);
      expect(spy).not.toHaveBeenCalledWith(name, expect.anything(), expect.anything());
    }
  });

  it('warns instead of silently no-oping when NativeModules cannot be enumerated', () => {
    jest.spyOn(environment, 'isTurboModuleEnabled').mockReturnValue(false);
    // Simulates the JSI host-object proxy, which exposes no enumerable keys.
    // Scoped to NativeModules so jest's own use of Object.keys keeps working.
    const realKeys = Object.keys;
    jest.spyOn(Object, 'keys').mockImplementation((o: object) => (o === NativeModules ? [] : realKeys(o)));
    const warn = jest.spyOn(debug, 'warn').mockImplementation(() => undefined);

    const wrapped = wrapAllNativeModules();

    expect(wrapped).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('found no modules to instrument'));
  });
});

function defineLazy(name: string, get: () => unknown): void {
  let value: unknown;
  let resolved = false;
  Object.defineProperty(NativeModules, name, {
    configurable: true,
    enumerable: true,
    get: () => {
      if (!resolved) {
        // Mirror RN's `defineLazyObjectProperty`: self-replace with a plain value.
        value = get();
        resolved = true;
        Object.defineProperty(NativeModules, name, {
          configurable: true,
          enumerable: true,
          writable: true,
          value,
        });
      }
      return value;
    },
    set: (next: unknown) => {
      value = next;
      resolved = true;
      Object.defineProperty(NativeModules, name, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: next,
      });
    },
  });
}
