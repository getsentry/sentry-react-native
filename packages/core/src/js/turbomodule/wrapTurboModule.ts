import { logger } from '@sentry/core';

import type { TurboModuleCallKind } from './turboModuleTracker';

import { notifyTurboModuleCallStart, recordTurboModuleCall } from './turboModuleAggregator';
import { popTurboModuleCall, pushTurboModuleCall, relabelTurboModuleCallKind } from './turboModuleTracker';

// Tracked off-module so sealed proxies (that can't accept a marker property) are protected from double-wrapping.
let wrappedModules = new WeakSet<object>();

/** Tests only. */
export function _resetWrappedModules(): void {
  wrappedModules = new WeakSet<object>();
}

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
    // Do NOT mark as wrapped — a later call (once a JSI HostObject materialises its methods) should retry.
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
    // JSI HostObject proxies may expose methods as accessors — guard so a throwing getter
    // is treated as non-wrappable instead of aborting the whole loop.
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
      // Start optimistic as sync; relabel to 'async' if the return value proves thenable.
      let callId: number | undefined;
      const startedAtMs = Date.now();
      let recordId: number | undefined;
      try {
        callId = pushTurboModuleCall({ name, method: key, kind: 'sync' });
      } catch (e) {
        logger.warn(`[TurboModuleTracker] push failed for ${name}.${key}: ${String(e)}`);
      }
      try {
        recordId = notifyTurboModuleCallStart(name, key, 'sync');
      } catch (e) {
        logger.warn(`[TurboModuleTracker] notifyStart failed for ${name}.${key}: ${String(e)}`);
      }

      let result: unknown;
      try {
        result = originalFn.apply(this, args);
      } catch (e) {
        safePop(callId, name, key);
        safeRecord(name, key, 'sync', startedAtMs, true, recordId);
        throw e;
      }

      if (isThenable(result)) {
        safeRelabel(callId, 'async', name, key);
        return (result as Promise<unknown>).then(
          value => {
            safePop(callId, name, key);
            safeRecord(name, key, 'async', startedAtMs, false, recordId);
            return value;
          },
          err => {
            safePop(callId, name, key);
            safeRecord(name, key, 'async', startedAtMs, true, recordId);
            throw err;
          },
        );
      }

      safePop(callId, name, key);
      safeRecord(name, key, 'sync', startedAtMs, false, recordId);
      return result;
    };

    try {
      target[key] = wrapper;
      wrappedAny = true;
    } catch {
      // sealed / non-writable — skip this method, keep wrapping the rest
    }
  }

  if (wrappedAny) {
    wrappedModules.add(module);
  } else {
    // Methods found but none writable — surface so the silent no-op is debuggable.
    logger.warn(
      `[TurboModuleTracker] '${name}' has methods but none could be wrapped — TurboModule context will not be attached. ` +
        `This usually means the module is frozen or its methods are non-writable accessors.`,
    );
  }

  return module;
}

// Walks the proto chain — JSI HostObject-backed TurboModule proxies expose methods
// via the proto rather than as own enumerable properties.
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
  recordId: number | undefined,
): void {
  try {
    recordTurboModuleCall({
      name,
      method,
      kind,
      durationMs: Date.now() - startedAtMs,
      errored,
      recordId,
    });
  } catch (e) {
    logger.warn(`[TurboModuleTracker] record failed for ${name}.${method}: ${String(e)}`);
  }
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
    return false;
  }
  // A user-defined `then` getter could throw — don't let that leak the tracker frame.
  try {
    const then = (value as { then?: unknown }).then;
    return typeof then === 'function';
  } catch {
    return false;
  }
}
