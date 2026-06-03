import * as SentryCore from '@sentry/core';
import { Scope } from '@sentry/core';

import { _resetTurboModuleTracker, getTurboModuleCallStack } from '../../src/js/turbomodule/turboModuleTracker';
import { _resetWrappedModules, wrapTurboModule } from '../../src/js/turbomodule/wrapTurboModule';

describe('wrapTurboModule', () => {
  let scope: Scope;

  beforeEach(() => {
    _resetTurboModuleTracker();
    _resetWrappedModules();
    scope = new Scope();
    jest.spyOn(SentryCore, 'getCurrentScope').mockReturnValue(scope);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns null/undefined modules unchanged', () => {
    expect(wrapTurboModule('X', null)).toBeNull();
    expect(wrapTurboModule('X', undefined)).toBeUndefined();
  });

  it('tracks sync method calls and pops after completion', () => {
    const seenDuringCall: ReturnType<typeof getTurboModuleCallStack> = [];
    const module = {
      doStuff: (a: number, b: number): number => {
        seenDuringCall.push(...getTurboModuleCallStack());
        return a + b;
      },
    };

    wrapTurboModule('Mod', module);

    const result = module.doStuff(2, 3);

    expect(result).toBe(5);
    expect(seenDuringCall).toHaveLength(1);
    expect(seenDuringCall[0]).toMatchObject({ name: 'Mod', method: 'doStuff', kind: 'sync' });
    expect(getTurboModuleCallStack()).toEqual([]);
  });

  it('pops on synchronous throw', () => {
    const module = {
      explode: () => {
        throw new Error('boom');
      },
    };

    wrapTurboModule('Mod', module);

    expect(() => module.explode()).toThrow('boom');
    expect(getTurboModuleCallStack()).toEqual([]);
  });

  it('tracks async method calls until the promise settles', async () => {
    let resolveCall: (value: string) => void = () => undefined;
    const module = {
      asyncOp: () =>
        new Promise<string>(resolve => {
          resolveCall = resolve;
        }),
    };

    wrapTurboModule('Mod', module);

    const promise = module.asyncOp();
    expect(getTurboModuleCallStack()).toHaveLength(1);

    resolveCall('done');
    await promise;

    expect(getTurboModuleCallStack()).toEqual([]);
  });

  it('relabels async calls to kind="async" once the call returns a thenable', () => {
    let resolveCall: (value: string) => void = () => undefined;
    const module = {
      asyncOp: () =>
        new Promise<string>(resolve => {
          resolveCall = resolve;
        }),
    };

    wrapTurboModule('Mod', module);

    const promise = module.asyncOp();

    expect(getTurboModuleCallStack()[0]).toMatchObject({ method: 'asyncOp', kind: 'async' });
    expect(scope.getScopeData().contexts.turbo_module).toMatchObject({ method: 'asyncOp', kind: 'async' });

    resolveCall('done');
    return promise;
  });

  it('pops when an async method rejects', async () => {
    const module = {
      asyncFail: () => Promise.reject(new Error('nope')),
    };

    wrapTurboModule('Mod', module);

    await expect(module.asyncFail()).rejects.toThrow('nope');
    expect(getTurboModuleCallStack()).toEqual([]);
  });

  it('skips methods listed in the skip option', () => {
    let seen: ReturnType<typeof getTurboModuleCallStack> = [];
    const module = {
      addListener: () => undefined,
      doStuff: () => {
        seen = getTurboModuleCallStack();
      },
    };

    wrapTurboModule('Mod', module, { skip: ['addListener'] });

    module.addListener();
    expect(getTurboModuleCallStack()).toEqual([]);

    module.doStuff();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ name: 'Mod', method: 'doStuff' });
  });

  it('does not re-wrap an already wrapped module', () => {
    const module = {
      doStuff: () => undefined,
    };
    wrapTurboModule('Mod', module);
    const wrappedOnce = module.doStuff;
    wrapTurboModule('Mod', module);

    expect(module.doStuff).toBe(wrappedOnce);
  });

  it('does not double-wrap a sealed module on repeated calls', () => {
    const module: { doStuff: () => void } = {
      doStuff: () => undefined,
    };
    wrapTurboModule('Mod', module);
    Object.seal(module);

    // Repeated wrap attempts must be no-ops, otherwise every real call would
    // push the same frame multiple times onto the tracker stack.
    wrapTurboModule('Mod', module);
    wrapTurboModule('Mod', module);

    module.doStuff();
    expect(getTurboModuleCallStack()).toEqual([]);
  });

  it('discovers methods exposed via the prototype chain (JSI HostObject shape)', () => {
    let stackDuringCall: ReturnType<typeof getTurboModuleCallStack> = [];
    class HostObjectLike {
      public doStuff(): string {
        stackDuringCall = getTurboModuleCallStack();
        return 'ok';
      }
    }
    const module = new HostObjectLike();

    // sanity: methods are exposed via the prototype, not as own properties
    expect(Object.keys(module)).toEqual([]);

    wrapTurboModule('HostObj', module);

    const result = module.doStuff();

    expect(result).toBe('ok');
    expect(stackDuringCall).toHaveLength(1);
    expect(stackDuringCall[0]).toMatchObject({ name: 'HostObj', method: 'doStuff' });
  });

  it('warns and bails out cleanly when no methods are discoverable', () => {
    const warnSpy = jest.spyOn(require('@sentry/react').logger, 'warn').mockImplementation(() => undefined);

    const opaque = Object.create(null) as object;

    wrapTurboModule('Opaque', opaque);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("No methods discovered on 'Opaque'"));
  });

  it('ignores non-function properties', () => {
    const module: { version: string; doStuff: () => number } = {
      version: '1.0.0',
      doStuff: () => 42,
    };

    wrapTurboModule('Mod', module);

    expect(module.version).toBe('1.0.0');
    expect(module.doStuff()).toBe(42);
  });
});
