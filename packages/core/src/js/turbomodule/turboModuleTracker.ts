import type { Scope } from '@sentry/core';

import { getIsolationScope } from '@sentry/core';

/** Whether a TurboModule invocation is `sync` (blocking) or `async` (returns a Promise). */
export type TurboModuleCallKind = 'sync' | 'async';

/**
 * Describes a single TurboModule method invocation currently in flight.
 */
export interface TurboModuleCall {
  /** TurboModule name, e.g. `RNSentry`. */
  name: string;
  /** Method name, e.g. `captureEnvelope`. */
  method: string;
  /** Whether the invocation is `sync` (blocking) or `async` (returns a Promise). */
  kind: TurboModuleCallKind;
  /** `Date.now()` at the moment the call started. */
  startedAtMs: number;
  /** Monotonically increasing id, used as the JS-side `call_id` cross-reference. */
  callId: number;
}

interface InternalCall extends TurboModuleCall {
  /**
   * Scope the call's context+tags were written to. Defaults to the isolation
   * scope because that's the one {@link enableSyncToNative} hooks: writes to
   * any other scope (e.g. a forked current scope inside `withScope`) update
   * JS-side state only and never reach sentry-cocoa / sentry-java, so a
   * native crash captured during the call would lose the attribution.
   *
   * Pinned at push time so an async call that spans a scope switch pops the
   * *same* scope it pushed onto — otherwise we'd clear `turbo_module` on the
   * wrong scope and leave stale data on the original.
   */
  scope: Scope;
}

const CONTEXT_KEY = 'turbo_module';
const TAG_NAME = 'turbo_module.name';
const TAG_METHOD = 'turbo_module.method';

/**
 * An `async` frame still on the stack after this long is treated as leaked and
 * evicted on the next push.
 *
 * {@link wrapTurboModule} pops an async frame only when its returned promise
 * settles. A native method that accepts a promise but never settles it (the
 * Android bug in #6821, or a custom module passed to
 * `turboModuleContextIntegration({ modules })`) would otherwise pin its frame —
 * and, via {@link syncToScope}, the native crash scope — for the entire process
 * lifetime, so every later crash is mis-attributed to that call. The sweep
 * bounds the damage to "attribution expires ~{@link MAX_ASYNC_FRAME_AGE_MS}
 * after the call started" instead of "wrong forever".
 *
 * Only `async` frames expire: `sync` and callback-style frames are popped
 * synchronously by the wrapper (see `wrapTurboModule.ts`), so they can never
 * outlive their call. Kept equal to `CALLBACK_MAX_AGE_MS` in
 * `turboModuleCallbacks.ts` on purpose — a never-settling call leaks both a
 * frame and (if callback-style) a pending-callback entry, and both should age
 * out at the same bound.
 */
export const MAX_ASYNC_FRAME_AGE_MS = 60_000;

/**
 * How many stale frames a single push may evict. Keeps the sweep amortised O(1)
 * on the wrap hot path, mirroring `CALLBACK_SWEEP_BUDGET`.
 */
const ASYNC_FRAME_SWEEP_BUDGET = 8;

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
  const startedAtMs = Date.now();

  // Opportunistically drop frames from earlier calls whose promise never
  // settled, before this call's attribution is written. `startedAtMs` is taken
  // microseconds ago, so reusing it as the cutoff saves a `Date.now()` at the
  // cost of an imperceptibly conservative bound (same trick as the callback
  // sweep). Isolated so an eviction failure can never block the real push.
  try {
    evictStaleAsyncFrames(startedAtMs);
  } catch {
    // ignore — the push below must still happen.
  }

  const call: InternalCall = {
    name: args.name,
    method: args.method,
    kind: args.kind,
    startedAtMs,
    callId: nextCallId++,
    // Default to the isolation scope: it's the one wired up to
    // `enableSyncToNative`, so writes here propagate to the native SDKs and
    // get serialised into crash reports. `getCurrentScope()` would be wrong
    // here — it can return a forked scope (per async-context strategy) that
    // sentry-cocoa / sentry-java never sees.
    scope: args.scope ?? getIsolationScope(),
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

/**
 * Evicts `async` frames older than {@link MAX_ASYNC_FRAME_AGE_MS} — calls whose
 * promise never settled, so {@link wrapTurboModule} never popped them. Bounded
 * by {@link ASYNC_FRAME_SWEEP_BUDGET} per call to keep the push hot path
 * amortised O(1).
 *
 * Reuses {@link popTurboModuleCall} for each eviction so the scope re-sync /
 * clear logic (including the cross-scope native re-sync) lives in exactly one
 * place. `callId`s are snapshotted first because `popTurboModuleCall` mutates
 * the stack. Only `async` frames are considered: `sync` and callback-style
 * frames are always popped synchronously by the wrapper.
 */
function evictStaleAsyncFrames(nowMs: number): void {
  let staleIds: number[] | undefined;
  let budget = ASYNC_FRAME_SWEEP_BUDGET;
  for (const frame of stack) {
    if (budget <= 0) {
      break;
    }
    if (frame.kind === 'async' && nowMs - frame.startedAtMs > MAX_ASYNC_FRAME_AGE_MS) {
      (staleIds ??= []).push(frame.callId);
      budget--;
    }
  }
  if (!staleIds) {
    return;
  }
  for (const callId of staleIds) {
    popTurboModuleCall(callId);
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
