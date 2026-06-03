import { logger } from '@sentry/react';

import { popTurboModuleCall, pushTurboModuleCall, relabelTurboModuleCallKind } from './turboModuleTracker';

/**
 * Modules we've already wrapped. Tracked off-module so that even sealed proxies
 * (which can't accept a marker property) are protected from double-wrapping.
 */
let wrappedModules = new WeakSet<object>();

/** Tests only. */
export function _resetWrappedModules(): void {
  wrappedModules = new WeakSet<object>();
}

/**
 * Wraps every function-valued property on the given TurboModule so that each
 * invocation is recorded on the Sentry TurboModule tracker. Returns the same
 * `module` reference for chaining convenience.
 *
 * - Sync methods are tracked as `kind: 'sync'` and popped right after the call.
 * - Async methods (those returning a thenable) are relabelled to `kind: 'async'`
 *   right after the call dispatches and popped when the returned promise settles.
 *
 * `skip` can be used to opt specific method names out of tracking (e.g. very
 * hot, no-op methods like RN's `addListener`/`removeListeners` event-emitter
 * stubs which would otherwise pollute the scope).
 */
export function wrapTurboModule<T extends object>(
  name: string,
  module: T | null | undefined,
  options: { skip?: ReadonlyArray<string> } = {},
): T | null | undefined {
  if (!module) {
    return module;
  }

  if (wrappedModules.has(module)) {
    return module;
  }
  wrappedModules.add(module);

  const skip = new Set(options.skip ?? []);
  const methodNames = collectMethodNames(module);

  if (methodNames.length === 0) {
    logger.warn(
      `[TurboModuleTracker] No methods discovered on '${name}' — TurboModule context will not be attached for this module. ` +
        `This usually means the module is a JSI HostObject that only materialises methods on first access.`,
    );
    return module;
  }

  const target = module as unknown as Record<string, unknown>;
  for (const key of methodNames) {
    if (skip.has(key)) {
      continue;
    }
    const original = target[key];
    if (typeof original !== 'function') {
      continue;
    }
    const originalFn = original as (...a: unknown[]) => unknown;

    const wrapper = function sentryTurboModuleWrapper(this: unknown, ...args: unknown[]): unknown {
      // We don't know yet whether `original` is sync or async — start optimistic
      // as sync, relabel to 'async' if the result turns out to be thenable.
      const callId = pushTurboModuleCall({ name, method: key, kind: 'sync' });
      let result: unknown;
      try {
        result = originalFn.apply(this, args);
      } catch (e) {
        popTurboModuleCall(callId);
        throw e;
      }

      if (isThenable(result)) {
        relabelTurboModuleCallKind(callId, 'async');
        return (result as Promise<unknown>).then(
          value => {
            popTurboModuleCall(callId);
            return value;
          },
          err => {
            popTurboModuleCall(callId);
            throw err;
          },
        );
      }

      popTurboModuleCall(callId);
      return result;
    };

    try {
      target[key] = wrapper;
    } catch {
      // Sealed / non-writable property — can't intercept this method, but we
      // can still wrap the rest. Skip silently; the module-level method-count
      // check above is the cliff that catches the "wrapped nothing" case.
    }
  }

  return module;
}

/**
 * Returns the union of own + prototype-chain method names on `module`,
 * deduplicated and skipping `Object.prototype`. Walking the prototype chain is
 * necessary for JSI HostObject-backed TurboModule proxies under RN's New
 * Architecture, which can expose methods via the proto chain rather than as
 * own enumerable properties.
 */
function collectMethodNames(module: object): string[] {
  const seen = new Set<string>();
  let current: object | null = module;
  while (current && current !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(current)) {
      if (key === 'constructor') {
        continue;
      }
      seen.add(key);
    }
    current = Object.getPrototypeOf(current) as object | null;
  }
  return Array.from(seen);
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
    return false;
  }
  const then = (value as { then?: unknown }).then;
  return typeof then === 'function';
}
