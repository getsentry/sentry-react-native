import { logger } from '@sentry/core';

import type { TurboModuleCallKind } from './turboModuleTracker';

import { recordTurboModuleCall } from './turboModuleAggregator';
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

  const skip = new Set(options.skip ?? []);
  const methodNames = collectMethodNames(module);

  if (methodNames.length === 0) {
    // Do NOT add to wrappedModules — a later call (e.g. once a JSI HostObject
    // has materialised its methods) should still get a chance to wrap.
    logger.warn(
      `[TurboModuleTracker] No methods discovered on '${name}' — TurboModule context will not be attached for this module. ` +
        `This usually means the module is a JSI HostObject that only materialises methods on first access.`,
    );
    return module;
  }

  let wrappedAny = false;
  const target = module as unknown as Record<string, unknown>;
  for (const key of methodNames) {
    if (skip.has(key)) {
      continue;
    }
    // `target[key]` may be a getter (some JSI HostObject proxies expose methods
    // as accessors under the New Architecture). Guard the read so a throwing
    // getter is treated like a non-wrappable property instead of aborting the
    // entire wrap loop.
    let original: unknown;
    try {
      original = target[key];
    } catch {
      continue;
    }
    if (typeof original !== 'function') {
      continue;
    }
    const originalFn = original as (...a: unknown[]) => unknown;

    const wrapper = function sentryTurboModuleWrapper(this: unknown, ...args: unknown[]): unknown {
      // The instrumentation must never break the user's call — every tracker
      // interaction is isolated so a failure inside Sentry only drops the
      // attribution data, never the real TurboModule invocation.
      //
      // We don't know yet whether `original` is sync or async — start optimistic
      // as sync, relabel to 'async' if the result turns out to be thenable.
      let callId: number | undefined;
      const startedAtMs = Date.now();
      try {
        callId = pushTurboModuleCall({ name, method: key, kind: 'sync' });
      } catch (e) {
        logger.warn(`[TurboModuleTracker] push failed for ${name}.${key}: ${String(e)}`);
      }

      let result: unknown;
      try {
        result = originalFn.apply(this, args);
      } catch (e) {
        safePop(callId, name, key);
        safeRecord(name, key, 'sync', startedAtMs, true);
        throw e;
      }

      if (isThenable(result)) {
        safeRelabel(callId, 'async', name, key);
        return (result as Promise<unknown>).then(
          value => {
            safePop(callId, name, key);
            safeRecord(name, key, 'async', startedAtMs, false);
            return value;
          },
          err => {
            safePop(callId, name, key);
            safeRecord(name, key, 'async', startedAtMs, true);
            throw err;
          },
        );
      }

      safePop(callId, name, key);
      safeRecord(name, key, 'sync', startedAtMs, false);
      return result;
    };

    try {
      target[key] = wrapper;
      wrappedAny = true;
    } catch {
      // Sealed / non-writable property — can't intercept this method, but we
      // can still wrap the rest. Skip silently.
    }
  }

  // Only mark as wrapped if we actually installed at least one wrapper.
  // Otherwise a future call (e.g. after the proxy has materialised methods)
  // should be allowed to retry.
  if (wrappedAny) {
    wrappedModules.add(module);
  } else {
    // We discovered methods but couldn't intercept any of them — e.g. the
    // module is frozen, or every method is a read-only accessor. Surface this
    // so the silent no-op is debuggable (the issue would otherwise look like
    // "no crash context attached" with no obvious cause).
    logger.warn(
      `[TurboModuleTracker] '${name}' has methods but none could be wrapped — TurboModule context will not be attached. ` +
        `This usually means the module is frozen or its methods are non-writable accessors.`,
    );
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

function safePop(callId: number | undefined, name: string, method: string): void {
  if (callId === undefined) {
    return;
  }
  try {
    popTurboModuleCall(callId);
  } catch (e) {
    logger.warn(`[TurboModuleTracker] pop failed for ${name}.${method}: ${String(e)}`);
  }
}

function safeRelabel(callId: number | undefined, kind: TurboModuleCallKind, name: string, method: string): void {
  if (callId === undefined) {
    return;
  }
  try {
    relabelTurboModuleCallKind(callId, kind);
  } catch (e) {
    logger.warn(`[TurboModuleTracker] relabel failed for ${name}.${method}: ${String(e)}`);
  }
}

function safeRecord(
  name: string,
  method: string,
  kind: TurboModuleCallKind,
  startedAtMs: number,
  errored: boolean,
): void {
  try {
    recordTurboModuleCall({
      name,
      method,
      kind,
      durationMs: Date.now() - startedAtMs,
      errored,
    });
  } catch (e) {
    logger.warn(`[TurboModuleTracker] record failed for ${name}.${method}: ${String(e)}`);
  }
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
    return false;
  }
  // A user-defined `then` getter could throw — don't let that escape into the
  // wrapper (which would leak the in-flight tracker frame on top of the bug).
  try {
    const then = (value as { then?: unknown }).then;
    return typeof then === 'function';
  } catch {
    return false;
  }
}
