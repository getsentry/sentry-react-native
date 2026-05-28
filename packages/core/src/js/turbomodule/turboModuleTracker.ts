import type { Scope } from '@sentry/core';

import { getCurrentScope } from '@sentry/core';

/**
 * Describes a single TurboModule method invocation currently in flight.
 */
export interface TurboModuleCall {
  /** TurboModule name, e.g. `RNSentry`. */
  name: string;
  /** Method name, e.g. `captureEnvelope`. */
  method: string;
  /** Whether the invocation is `sync` (blocking) or `async` (returns a Promise). */
  kind: 'sync' | 'async';
  /** `Date.now()` at the moment the call started. */
  startedAtMs: number;
  /** Monotonically increasing id, used as the JS-side `call_id` cross-reference. */
  callId: number;
}

const CONTEXT_KEY = 'turbo_module';
const TAG_NAME = 'turbo_module.name';
const TAG_METHOD = 'turbo_module.method';

let nextCallId = 0;

/**
 * Stack of active TurboModule invocations.
 *
 * React Native's TurboModule perf logger fires `syncMethodCallStart/End` and
 * `asyncMethodCallExecutionStart/End` from the thread executing the C++ method.
 * In JS-land we don't have per-OS-thread storage, but the JS thread is single
 * threaded — so a single shared stack faithfully models the active call chain
 * for everything dispatched from JS.
 *
 * NOTE: This is an in-memory mirror only. For true async-signal-safety on the
 * native crash path we'd want to also write a fixed-size ring buffer of
 * `{module_id, method_id}` indexes into shared storage that sentry-cocoa /
 * sentry-java can read from a signal handler. The current implementation relies
 * on the native SDKs' existing scope mirroring (which serialises `contexts` and
 * `tags` for crash reports) — this covers crashes that happen *after* the
 * scope update is flushed but is not strictly async-signal-safe.
 */
const stack: TurboModuleCall[] = [];

/**
 * Returns the active TurboModule call (top of stack), or `undefined` if no
 * TurboModule call is currently being tracked.
 */
export function getActiveTurboModuleCall(): TurboModuleCall | undefined {
  return stack[stack.length - 1];
}

/**
 * Returns a copy of the current TurboModule call stack, top-most call last.
 * Exposed for tests and diagnostics.
 */
export function getTurboModuleCallStack(): TurboModuleCall[] {
  return stack.slice();
}

/**
 * Resets the tracker. Tests only.
 */
export function _resetTurboModuleTracker(): void {
  stack.length = 0;
  nextCallId = 0;
}

/**
 * Records the start of a TurboModule method invocation and mirrors it onto the
 * current Sentry scope so that any crash report captured during the call
 * carries `contexts.turbo_module` + `turbo_module.*` tags.
 *
 * Returns the assigned `callId`, to be passed back into {@link popTurboModuleCall}.
 */
export function pushTurboModuleCall(args: {
  name: string;
  method: string;
  kind: 'sync' | 'async';
  scope?: Scope;
}): number {
  const call: TurboModuleCall = {
    name: args.name,
    method: args.method,
    kind: args.kind,
    startedAtMs: Date.now(),
    callId: nextCallId++,
  };

  stack.push(call);
  syncToScope(call, args.scope);
  return call.callId;
}

/**
 * Records the end of a TurboModule method invocation previously started with
 * {@link pushTurboModuleCall}. Pops the matching frame off the stack and
 * updates the Sentry scope to point at the new top (or clears the context if
 * the stack is now empty).
 *
 * `callId` is the value returned by `pushTurboModuleCall`. If the call cannot
 * be found (e.g. due to a misuse / race), the pop is a no-op.
 */
export function popTurboModuleCall(callId: number, scope?: Scope): void {
  // The common case is a perfectly nested LIFO — pop from the end.
  const top = stack[stack.length - 1];
  if (top?.callId === callId) {
    stack.pop();
  } else {
    // Out-of-order completion (async). Find and splice.
    const index = stack.findIndex(c => c.callId === callId);
    if (index < 0) {
      return;
    }
    stack.splice(index, 1);
  }

  const newTop = stack[stack.length - 1];
  if (newTop) {
    syncToScope(newTop, scope);
  } else {
    clearScope(scope);
  }
}

function syncToScope(call: TurboModuleCall, scope?: Scope): void {
  const target = scope ?? getCurrentScope();
  target.setContext(CONTEXT_KEY, {
    name: call.name,
    method: call.method,
    kind: call.kind,
    started_at_ms: call.startedAtMs,
    call_id: call.callId,
  });
  target.setTag(TAG_NAME, call.name);
  target.setTag(TAG_METHOD, call.method);
}

function clearScope(scope?: Scope): void {
  const target = scope ?? getCurrentScope();
  target.setContext(CONTEXT_KEY, null);
  target.setTag(TAG_NAME, undefined);
  target.setTag(TAG_METHOD, undefined);
}
