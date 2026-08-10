/**
 * Instrumentation for callback-style native module methods.
 *
 * `wrapTurboModule` can only close a call record on its own for two shapes: a
 * plain sync return, and a thenable return. Bridge methods that report
 * completion through success/failure callbacks return `undefined` — the
 * dominant async shape on the Old Architecture, and still used by some
 * TurboModules — so without this layer they collapse to ~0ms sync calls.
 *
 * See https://github.com/getsentry/sentry-react-native/issues/6542.
 */

import { debug } from '@sentry/core';

import type { TurboModuleCallKind } from './turboModuleTracker';

import { recordTurboModuleCall, type TurboModuleArch } from './turboModuleAggregator';

/**
 * Cap on callback-style calls awaiting their completion callback. A callback
 * that is never invoked would otherwise pin its state forever, so the oldest
 * entry is closed out without a duration once the cap is reached.
 */
export const MAX_PENDING_CALLBACK_CALLS = 1024;

/**
 * A completion callback that fires later than this is treated as not being a
 * completion callback at all (e.g. a long-lived subscription handler on the New
 * Architecture, where no `(failure, success)` convention is enforced). The call
 * is still counted, but with a zero duration, so a multi-minute "duration"
 * can't poison the aggregate or fire a bogus slow-call breadcrumb.
 */
export const CALLBACK_MAX_AGE_MS = 60_000;

/**
 * How many stale entries a single insert may sweep. Keeps the age sweep
 * amortised O(1) on the wrap hot path.
 */
const CALLBACK_SWEEP_BUDGET = 8;

interface PendingCallbackCall {
  startedAtMs: number;
  /** Closes the call without a trustworthy duration; later callbacks no-op. */
  expire: () => void;
}

/** Insertion-ordered, so the first entry is always the oldest. */
let pendingCallbackCalls = new Map<number, PendingCallbackCall>();
let nextPendingCallbackId = 0;

/** Tests only. */
export function _resetPendingCallbackCalls(): void {
  pendingCallbackCalls = new Map();
  nextPendingCallbackId = 0;
}

export interface CallbackCallHandle {
  /** Called once the instrumented method returned without a thenable. */
  markReturned: () => void;
  /**
   * Drops the bookkeeping: later callback invocations become no-ops. Returns
   * `true` if a record was already emitted, so the caller doesn't double-count.
   */
  abandon: () => boolean;
}

/**
 * State shared between the wrapped callbacks and the returned handle. Held in an
 * object rather than closure variables so `instrumentTrailingCallbacks` can
 * neutralise callbacks it had already installed if it fails part-way through.
 */
interface CallbackCallState {
  settled: boolean;
  returned: boolean;
  pendingId: number | undefined;
}

/**
 * Records a TurboModule invocation, isolated so a failure inside Sentry only
 * drops the data instead of breaking the user's call.
 */
export function safeRecordTurboModuleCall(
  name: string,
  method: string,
  kind: TurboModuleCallKind,
  durationMs: number,
  errored: boolean,
  recordId: number | undefined,
  arch: TurboModuleArch,
): void {
  try {
    recordTurboModuleCall({
      name,
      method,
      kind,
      durationMs,
      errored,
      recordId,
      arch,
    });
  } catch (e) {
    debug.warn(`[TurboModuleTracker] record failed for ${name}.${method}: ${String(e)}`);
  }
}

/**
 * Wraps the trailing completion callbacks of `args` in place so the call's
 * record is emitted when the callback fires rather than when the method
 * returns. Returns `undefined` when the method isn't callback-shaped, which is
 * the common case — nothing is allocated on that path.
 *
 * Never throws, and neither do the returned handle's methods: this runs outside
 * the caller's `try` and before the real invocation, so a failure here must
 * only drop the attribution data, never block or corrupt the user's call.
 *
 * React Native's bridge fixes the shape: the last argument is the success
 * callback, the second-to-last the failure callback, and a non-function
 * argument may never follow a function one (see `genMethod` in RN's
 * `Libraries/BatchedBridge/NativeModules.js`). `'promise'`-typed methods never
 * receive callbacks and are already covered by the thenable path, so they are
 * skipped outright.
 */
export function instrumentTrailingCallbacks(
  args: unknown[],
  originalFn: (...a: unknown[]) => unknown,
  name: string,
  method: string,
  startedAtMs: number,
  recordId: number | undefined,
  arch: TurboModuleArch,
): CallbackCallHandle | undefined {
  const state: CallbackCallState = { settled: false, returned: false, pendingId: undefined };
  try {
    return createCallbackCall(state, args, originalFn, name, method, startedAtMs, recordId, arch);
  } catch (e) {
    // Some callbacks may already have been swapped into `args` — arity and
    // argument types are unchanged, so the user's call is unaffected, but they
    // must not emit anything: the caller sees `undefined` and now closes the
    // record itself.
    state.settled = true;
    debug.warn(`[TurboModuleTracker] callback instrumentation failed for ${name}.${method}: ${String(e)}`);
    return undefined;
  }
}

/** Body of {@link instrumentTrailingCallbacks}; may throw, isolated by its caller. */
function createCallbackCall(
  state: CallbackCallState,
  args: unknown[],
  originalFn: (...a: unknown[]) => unknown,
  name: string,
  method: string,
  startedAtMs: number,
  recordId: number | undefined,
  arch: TurboModuleArch,
): CallbackCallHandle | undefined {
  const methodType = (originalFn as { type?: unknown }).type;
  if (methodType === 'promise') {
    return undefined;
  }

  const lastIndex = args.length - 1;
  if (lastIndex < 0 || typeof args[lastIndex] !== 'function') {
    return undefined;
  }
  const failureIndex = lastIndex > 0 && typeof args[lastIndex - 1] === 'function' ? lastIndex - 1 : -1;

  // Only the Old Architecture bridge guarantees that the second-to-last
  // function is the failure callback. New Architecture TurboModules take
  // arbitrary callbacks with no such convention, so guessing there would
  // corrupt `errorCount` — close the record without flagging an error instead.
  const failureIsError = failureIndex >= 0 && arch === 'legacy' && typeof methodType === 'string';

  const settle = (errored: boolean, durationMs: number): void => {
    if (state.settled) {
      return;
    }
    state.settled = true;
    forgetPendingCall(state);
    safeRecordTurboModuleCall(
      name,
      method,
      // A callback that already fired before the method returned means the work
      // was synchronous (RN's `'sync'` method type invokes callbacks inline).
      state.returned ? 'async' : 'sync',
      durationMs,
      errored,
      recordId,
      arch,
    );
  };

  const emit = (errored: boolean): void => {
    const durationMs = Date.now() - startedAtMs;
    // A callback firing this late is not a completion callback (e.g. a
    // long-lived subscription handler), so its "duration" is meaningless.
    // Still record the call itself — dropping it would hide the method from
    // the aggregate entirely, which is worse than the pre-fix ~0ms.
    settle(errored, state.returned && durationMs > CALLBACK_MAX_AGE_MS ? 0 : durationMs);
  };

  args[lastIndex] = instrumentCallback(args[lastIndex] as (...a: unknown[]) => unknown, false, emit);
  if (failureIndex >= 0) {
    args[failureIndex] = instrumentCallback(args[failureIndex] as (...a: unknown[]) => unknown, failureIsError, emit);
  }

  return {
    markReturned: (): void => {
      // Set before the guarded part: a later callback must be attributed as
      // 'async' even if registering the pending entry fails.
      state.returned = true;
      if (state.settled) {
        return;
      }
      try {
        evictStalePendingCallbackCalls(startedAtMs);
        state.pendingId = nextPendingCallbackId++;
        pendingCallbackCalls.set(state.pendingId, {
          startedAtMs,
          // Closed out before the callback fired: keep the call in the
          // aggregate, but with no duration we can stand behind.
          expire: (): void => {
            state.pendingId = undefined;
            settle(false, 0);
          },
        });
      } catch (e) {
        // Only the bound on this one call is lost; the callback can still
        // close the record when it fires.
        state.pendingId = undefined;
        debug.warn(`[TurboModuleTracker] pending registration failed for ${name}.${method}: ${String(e)}`);
      }
    },
    abandon: (): boolean => {
      // Throw-free: only local state and a `Map.delete`.
      const alreadyRecorded = state.settled;
      state.settled = true;
      forgetPendingCall(state);
      return alreadyRecorded;
    },
  };
}

/** Drops the pending entry, if any, without emitting a record. */
function forgetPendingCall(state: CallbackCallState): void {
  if (state.pendingId !== undefined) {
    pendingCallbackCalls.delete(state.pendingId);
    state.pendingId = undefined;
  }
}

/**
 * Returns a stand-in for `callback` that closes the pending record before
 * handing control to the original. The bookkeeping runs first so the callback's
 * own body isn't counted as native time, and is isolated so a tracker failure
 * can never break the user's callback.
 */
function instrumentCallback(
  callback: (...a: unknown[]) => unknown,
  errored: boolean,
  emit: (errored: boolean) => void,
): (...a: unknown[]) => unknown {
  return function sentryTurboModuleCallback(this: unknown, ...callbackArgs: unknown[]): unknown {
    try {
      emit(errored);
    } catch (e) {
      debug.warn(`[TurboModuleTracker] callback record failed: ${String(e)}`);
    }
    return callback.apply(this, callbackArgs);
  };
}

/**
 * Closes out pending callback calls that aged out, plus the oldest entry when
 * the cap is reached. Bounded per invocation so the sweep stays amortised O(1)
 * on the wrap hot path.
 *
 * `nowMs` is the current call's start timestamp — taken microseconds ago, so it
 * saves a `Date.now()` on the hot path at the cost of an imperceptibly
 * conservative cutoff.
 */
function evictStalePendingCallbackCalls(nowMs: number): void {
  let budget = CALLBACK_SWEEP_BUDGET;
  for (const [id, pending] of pendingCallbackCalls) {
    if (budget-- <= 0 || nowMs - pending.startedAtMs <= CALLBACK_MAX_AGE_MS) {
      break;
    }
    pendingCallbackCalls.delete(id);
    pending.expire();
  }

  while (pendingCallbackCalls.size >= MAX_PENDING_CALLBACK_CALLS) {
    const oldest = pendingCallbackCalls.entries().next();
    if (oldest.done) {
      break;
    }
    const [id, pending] = oldest.value;
    pendingCallbackCalls.delete(id);
    pending.expire();
    debug.log(
      `[TurboModuleTracker] More than ${MAX_PENDING_CALLBACK_CALLS} callback-style calls awaiting completion — ` +
        `closing the oldest one without a duration.`,
    );
  }
}
