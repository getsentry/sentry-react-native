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

interface InternalCall extends TurboModuleCall {
  /**
   * Scope captured at push time. We pin it so that an async call which spans a
   * scope switch (`withScope`, isolation-scope swaps, …) pops the *same* scope
   * it pushed onto — otherwise we'd clear `turbo_module` on the wrong scope and
   * leave stale data on the original.
   */
  scope: Scope;
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
const stack: InternalCall[] = [];

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
  const call: InternalCall = {
    name: args.name,
    method: args.method,
    kind: args.kind,
    startedAtMs: Date.now(),
    callId: nextCallId++,
    scope: args.scope ?? getCurrentScope(),
  };

  // Atomic push: if `syncToScope` throws (e.g. a scope-sync hook calls into a
  // native bridge that rejects with `_NativeClientError`), roll back the stack
  // push so we don't leak a frame.
  stack.push(call);
  try {
    syncToScope(call);
  } catch (e) {
    stack.pop();
    throw e;
  }
  return call.callId;
}

/**
 * Updates the `kind` of a previously-pushed call (in place) and re-syncs the
 * scope if the call is currently the active one. Used by
 * {@link wrapTurboModule} once it discovers that a method's return value is
 * thenable.
 *
 * Returns `true` if the call was found and relabelled.
 */
export function relabelTurboModuleCallKind(callId: number, kind: 'sync' | 'async'): boolean {
  const call = stack.find(c => c.callId === callId);
  if (!call || call.kind === kind) {
    return !!call;
  }
  call.kind = kind;
  if (stack[stack.length - 1] === call) {
    syncToScope(call);
  }
  return true;
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
export function popTurboModuleCall(callId: number): void {
  // The common case is a perfectly nested LIFO — pop from the end.
  let popped: InternalCall | undefined;
  const top = stack[stack.length - 1];
  if (top?.callId === callId) {
    popped = stack.pop();
  } else {
    // Out-of-order completion (async). Find and splice.
    const index = stack.findIndex(c => c.callId === callId);
    if (index < 0) {
      return;
    }
    [popped] = stack.splice(index, 1);
  }

  if (!popped) {
    return;
  }

  // 1. Reflect the new state of `popped.scope` (the scope this call was pinned
  //    to). When scopes interleave on the stack (e.g. [A@s1, B@s2, C@s1] and
  //    we pop C), the immediate stack top is *not* the right thing to look at:
  //    there may still be a deeper frame holding `popped.scope` whose context
  //    we'd wipe by calling `clearScope`. Walk the stack from the top down and
  //    re-sync onto the newest remaining frame on `popped.scope`; only clear
  //    if none is left.
  let remainingOnSameScope: InternalCall | undefined;
  for (let i = stack.length - 1; i >= 0; i--) {
    const frame = stack[i];
    if (frame && frame.scope === popped.scope) {
      remainingOnSameScope = frame;
      break;
    }
  }
  if (remainingOnSameScope) {
    syncToScope(remainingOnSameScope);
  } else {
    clearScope(popped.scope);
  }

  // 2. The native SDKs (sentry-cocoa / sentry-java) share a *single* native
  //    scope, but JS has many Scope objects (global, isolation, withScope, …).
  //    Every `Scope#setContext` / `Scope#setTag` we just made in step 1 fired
  //    the `scopeSync.ts` hook and overwrote the native scope's `turbo_module`
  //    context — even if the global top of the stack still lives on a
  //    *different* JS scope. Without this second sync, a crash that follows a
  //    cross-scope pop would land in native without the active TurboModule
  //    attribution, even though the global stack still has an in-flight call.
  //
  //    Re-sync the global stack top via *its* scope so native ends up holding
  //    the correct active-call context. The intermediate native write in step 1
  //    is wasted but unavoidable without bypassing the public Scope API.
  const globalTop = stack[stack.length - 1];
  if (globalTop && globalTop !== remainingOnSameScope) {
    syncToScope(globalTop);
  }
}

function syncToScope(call: InternalCall): void {
  call.scope.setContext(CONTEXT_KEY, {
    name: call.name,
    method: call.method,
    kind: call.kind,
    started_at_ms: call.startedAtMs,
    call_id: call.callId,
  });
  call.scope.setTag(TAG_NAME, call.name);
  call.scope.setTag(TAG_METHOD, call.method);
}

// Empty-string sentinel for the "no active call" state. We don't pass
// `undefined` because the native `setTag(key, value)` TurboModule spec
// requires a string — the bridge would otherwise see `undefined` and either
// throw or silently drop the call. `setContext(CONTEXT_KEY, null)` is the
// canonical "no active call" signal; the empty tags exist only so the tag set
// doesn't carry stale `name`/`method` from the previous call.
const NO_ACTIVE_CALL = '';

function clearScope(scope: Scope): void {
  scope.setContext(CONTEXT_KEY, null);
  scope.setTag(TAG_NAME, NO_ACTIVE_CALL);
  scope.setTag(TAG_METHOD, NO_ACTIVE_CALL);
}
