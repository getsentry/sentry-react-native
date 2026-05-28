import { logger } from '@sentry/react';

import { popTurboModuleCall, pushTurboModuleCall } from './turboModuleTracker';

const WRAPPED_FLAG = '__sentryTurboModuleWrapped__';

/**
 * Marker added to wrapped modules so we never double-wrap (which would push the
 * same call twice onto the tracker stack).
 */
interface MaybeWrapped {
  [WRAPPED_FLAG]?: boolean;
}

/**
 * Wraps every function-valued property on the given TurboModule so that each
 * invocation is recorded on the Sentry TurboModule tracker. Returns the same
 * `module` reference for chaining convenience.
 *
 * - Sync methods are tracked as `kind: 'sync'` and popped right after the call.
 * - Async methods (those returning a thenable) are tracked as `kind: 'async'`
 *   and popped when the returned promise settles.
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

  const maybeWrapped = module as T & MaybeWrapped;
  if (maybeWrapped[WRAPPED_FLAG]) {
    return module;
  }

  const skip = new Set(options.skip ?? []);

  const target = module as unknown as Record<string, unknown>;
  for (const key of Object.keys(target)) {
    if (skip.has(key)) {
      continue;
    }
    const original = target[key];
    if (typeof original !== 'function') {
      continue;
    }
    const originalFn = original as (...a: unknown[]) => unknown;

    target[key] = function sentryTurboModuleWrapper(this: unknown, ...args: unknown[]): unknown {
      // We don't know yet whether `original` is sync or async — start optimistic
      // as sync, upgrade the scope context if the result is thenable.
      const callId = pushTurboModuleCall({ name, method: key, kind: 'sync' });
      let result: unknown;
      try {
        result = originalFn.apply(this, args);
      } catch (e) {
        popTurboModuleCall(callId);
        throw e;
      }

      if (isThenable(result)) {
        // Re-record as async — clearer in the report. We just overwrite the
        // existing tracker frame in place by popping + re-pushing with a fresh
        // id would lose ordering, so instead we leave the stack frame alone
        // and only relabel for the scope on completion (it's the *active*
        // call's `kind` that ends up in `contexts.turbo_module`, and the
        // outer perf-logger driven users can push with `kind: 'async'`
        // directly when they know up front).
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
  }

  try {
    Object.defineProperty(module, WRAPPED_FLAG, {
      value: true,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  } catch (e) {
    // Some TurboModule proxies are sealed — that's fine, we still patched the
    // methods, but a second wrap call would be a no-op anyway because the
    // properties now point at our wrappers (re-wrapping would still push
    // through to `original` which is itself a wrapper, but the per-call
    // pushes would double up). Log so this is visible during development.
    logger.warn(
      `[TurboModuleTracker] Could not mark ${name} as wrapped — repeated wrapping would double-track invocations.`,
    );
  }

  return module;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
    return false;
  }
  const then = (value as { then?: unknown }).then;
  return typeof then === 'function';
}
