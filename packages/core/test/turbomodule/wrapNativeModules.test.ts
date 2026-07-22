import { NativeModules } from 'react-native';

import { wrapAllNativeModules } from '../../src/js/turbomodule/wrapNativeModules';
import * as wrapTurboModuleMod from '../../src/js/turbomodule/wrapTurboModule';
import { _resetWrappedModules } from '../../src/js/turbomodule/wrapTurboModule';
import * as environment from '../../src/js/utils/environment';

describe('wrapAllNativeModules', () => {
  const originalKeys = Object.keys(NativeModules);

  beforeEach(() => {
    _resetWrappedModules();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    // Clear anything the test added to NativeModules so it doesn't leak.
    for (const key of Object.keys(NativeModules)) {
      if (!originalKeys.includes(key)) {
        // oxlint-disable-next-line typescript-eslint(no-dynamic-delete)
        delete (NativeModules as Record<string, unknown>)[key];
      }
    }
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
});
