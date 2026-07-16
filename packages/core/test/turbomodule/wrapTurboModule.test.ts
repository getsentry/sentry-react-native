import * as SentryCore from '@sentry/core';
import { Scope } from '@sentry/core';

import { _resetTurboModuleAggregator, drainTurboModuleAggregate } from '../../src/js/turbomodule/turboModuleAggregator';
import * as tracker from '../../src/js/turbomodule/turboModuleTracker';
import { _resetTurboModuleTracker, getTurboModuleCallStack } from '../../src/js/turbomodule/turboModuleTracker';
import { _resetWrappedModules, wrapTurboModule } from '../../src/js/turbomodule/wrapTurboModule';

describe('wrapTurboModule', () => {
  let scope: Scope;

  beforeEach(() => {
    _resetTurboModuleTracker();
    _resetTurboModuleAggregator();
    _resetWrappedModules();
    scope = new Scope();
    // `pushTurboModuleCall` defaults to `getIsolationScope()` (see commit
    // `fix(turbomodule): Default TM tracker to isolation scope for native sync`),
    // so the tracker writes context/tags onto whichever scope this returns.
    // We also mock `getCurrentScope` for any code in the wrapper that may
    // read it directly, to keep the test deterministic regardless of
    // `@sentry/core`'s async-context strategy in the test environment.
    jest.spyOn(SentryCore, 'getIsolationScope').mockReturnValue(scope);
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

    // Repeated wrap attempts must be no-ops — every real call should push
    // exactly one frame onto the tracker, no matter how many times we wrapped.
    wrapTurboModule('Mod', module);
    wrapTurboModule('Mod', module);

    const pushSpy = jest.spyOn(tracker, 'pushTurboModuleCall');
    module.doStuff();
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(getTurboModuleCallStack()).toEqual([]);
  });

  it('retries wrapping a previously-empty module (lazy JSI HostObject)', () => {
    const warnSpy = jest.spyOn(require('@sentry/core').logger, 'warn').mockImplementation(() => undefined);

    // First call: methods not yet materialised — should warn, NOT mark as wrapped.
    const lazyModule: { doStuff?: () => string } = Object.create(null) as { doStuff?: () => string };
    wrapTurboModule('Lazy', lazyModule);
    expect(warnSpy).toHaveBeenCalled();

    // Methods materialise (simulating a HostObject's lazy method resolution).
    let seenDuringCall: ReturnType<typeof getTurboModuleCallStack> = [];
    lazyModule.doStuff = () => {
      seenDuringCall = getTurboModuleCallStack();
      return 'ok';
    };

    // Second wrap must now actually install a wrapper on the freshly-discovered method.
    wrapTurboModule('Lazy', lazyModule);

    const result = lazyModule.doStuff();

    expect(result).toBe('ok');
    expect(seenDuringCall).toHaveLength(1);
    expect(seenDuringCall[0]).toMatchObject({ name: 'Lazy', method: 'doStuff' });
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

  it('warns when methods are discovered but none could be wrapped (frozen module)', () => {
    const warnSpy = jest.spyOn(require('@sentry/core').logger, 'warn').mockImplementation(() => undefined);

    const frozen = Object.freeze({ doStuff: () => 'ok' });

    wrapTurboModule('Frozen', frozen);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("'Frozen' has methods but none could be wrapped"));
  });

  it('still calls the original method when the tracker push throws (native bridge error)', () => {
    const warnSpy = jest.spyOn(require('@sentry/core').logger, 'warn').mockImplementation(() => undefined);
    // Simulate a scope-sync hook that calls into a native bridge which throws.
    jest.spyOn(scope, 'setContext').mockImplementation(() => {
      throw new Error('NATIVE.setContext boom');
    });

    const originalFn = jest.fn(() => 'real-result');
    const module = { doStuff: originalFn };

    wrapTurboModule('Mod', module);

    // The user's call must still complete with the original return value
    // — Sentry's instrumentation can never break the wrapped TurboModule.
    const result = module.doStuff();

    expect(result).toBe('real-result');
    expect(originalFn).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('push failed for Mod.doStuff'));
    // And the failed push left no leaked frame on the tracker.
    expect(getTurboModuleCallStack()).toEqual([]);
  });

  it('still calls the original method when the tracker pop throws', () => {
    const warnSpy = jest.spyOn(require('@sentry/core').logger, 'warn').mockImplementation(() => undefined);

    const originalFn = jest.fn(() => 42);
    const module = { doStuff: originalFn };

    wrapTurboModule('Mod', module);

    // Make `setContext` throw only on the pop's restore/clear path. We do this
    // by letting push succeed, then breaking setContext before the pop fires.
    let setContextCalls = 0;
    jest.spyOn(scope, 'setContext').mockImplementation(() => {
      setContextCalls++;
      if (setContextCalls > 1) {
        throw new Error('clear boom');
      }
      return scope;
    });

    expect(() => module.doStuff()).not.toThrow();
    expect(originalFn).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('pop failed for Mod.doStuff'));
  });

  it('does not leak a tracker frame when the result has a throwing `then` getter', () => {
    const trap = Object.defineProperty({}, 'then', {
      get() {
        throw new Error('boom');
      },
    });
    const module = {
      weird: () => trap,
    };

    wrapTurboModule('Mod', module);

    // Must not throw, must not leave a frame on the stack.
    expect(() => module.weird()).not.toThrow();
    expect(getTurboModuleCallStack()).toEqual([]);
  });

  it('warns and bails out cleanly when no methods are discoverable', () => {
    const warnSpy = jest.spyOn(require('@sentry/core').logger, 'warn').mockImplementation(() => undefined);

    const opaque = Object.create(null) as object;

    wrapTurboModule('Opaque', opaque);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("No methods discovered on 'Opaque'"));
  });

  it('skips properties whose getter throws (JSI HostObject accessor edge case)', () => {
    let stackDuringCall: ReturnType<typeof getTurboModuleCallStack> = [];
    const module = {
      doStuff: () => {
        stackDuringCall = getTurboModuleCallStack();
        return 'ok';
      },
    };
    Object.defineProperty(module, 'throwingGetter', {
      enumerable: true,
      configurable: true,
      get() {
        throw new Error('getter boom');
      },
    });

    // Wrapping must not propagate the getter's throw; wrappable methods on the
    // same module should still be wrapped.
    expect(() => wrapTurboModule('Mod', module)).not.toThrow();

    expect(module.doStuff()).toBe('ok');
    expect(stackDuringCall).toHaveLength(1);
    expect(stackDuringCall[0]).toMatchObject({ name: 'Mod', method: 'doStuff' });
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

  it('feeds sync and async calls into the aggregator', async () => {
    const module = {
      sync: () => 'ok',
      asyncOk: () => Promise.resolve('done'),
    };
    wrapTurboModule('Mod', module);

    module.sync();
    await module.asyncOk();

    const snapshot = drainTurboModuleAggregate();
    expect(snapshot.map(r => ({ method: r.method, kind: r.kind, callCount: r.callCount }))).toEqual(
      expect.arrayContaining([
        { method: 'sync', kind: 'sync', callCount: 1 },
        { method: 'asyncOk', kind: 'async', callCount: 1 },
      ]),
    );
  });
});
