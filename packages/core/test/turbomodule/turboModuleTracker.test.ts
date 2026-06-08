import { Scope } from '@sentry/core';

import {
  _resetTurboModuleTracker,
  getActiveTurboModuleCall,
  getTurboModuleCallStack,
  popTurboModuleCall,
  pushTurboModuleCall,
  relabelTurboModuleCallKind,
} from '../../src/js/turbomodule/turboModuleTracker';

describe('turboModuleTracker', () => {
  let scope: Scope;

  beforeEach(() => {
    _resetTurboModuleTracker();
    scope = new Scope();
  });

  it('starts empty', () => {
    expect(getActiveTurboModuleCall()).toBeUndefined();
    expect(getTurboModuleCallStack()).toEqual([]);
  });

  it('pushes a call and exposes it on the scope', () => {
    const id = pushTurboModuleCall({ name: 'RNSentry', method: 'captureEnvelope', kind: 'async', scope });

    const active = getActiveTurboModuleCall();
    expect(active).toMatchObject({
      name: 'RNSentry',
      method: 'captureEnvelope',
      kind: 'async',
      callId: id,
    });
    expect(typeof active!.startedAtMs).toBe('number');

    const ctx = scope.getScopeData().contexts.turbo_module;
    expect(ctx).toMatchObject({
      name: 'RNSentry',
      method: 'captureEnvelope',
      kind: 'async',
      call_id: id,
    });
    expect(scope.getScopeData().tags).toMatchObject({
      'turbo_module.name': 'RNSentry',
      'turbo_module.method': 'captureEnvelope',
    });
  });

  it('clears the scope when the stack drains', () => {
    const id = pushTurboModuleCall({ name: 'RNSentry', method: 'crash', kind: 'sync', scope });
    popTurboModuleCall(id);

    expect(getActiveTurboModuleCall()).toBeUndefined();
    expect(scope.getScopeData().contexts.turbo_module).toBeUndefined();
    // Tags are cleared to the empty-string sentinel (native `setTag` requires a string).
    expect(scope.getScopeData().tags['turbo_module.name']).toBe('');
    expect(scope.getScopeData().tags['turbo_module.method']).toBe('');
  });

  it('re-syncs the global stack top to its scope after a cross-scope pop', () => {
    // Native SDKs share one scope; when scope A is cleared on pop, the
    // scopeSync hook would also wipe native. We must re-sync the global top
    // (which lives on scope B) so native crash reports keep the active call.
    const scopeA = new Scope();
    const scopeB = new Scope();

    const aCallId = pushTurboModuleCall({ name: 'A', method: 'a', kind: 'sync', scope: scopeA });
    pushTurboModuleCall({ name: 'B', method: 'b', kind: 'sync', scope: scopeB });

    const setContextSpy = jest.spyOn(scopeB, 'setContext');

    popTurboModuleCall(aCallId);

    // scopeA's frame is gone, so scopeA's context was cleared (good for JS hygiene).
    expect(scopeA.getScopeData().contexts.turbo_module).toBeUndefined();
    // scopeB still holds the active call — and we proactively re-synced it via
    // scopeB.setContext so the shared native scope ends up holding B's data
    // rather than the null left behind by scopeA's clear.
    expect(scopeB.getScopeData().contexts.turbo_module).toMatchObject({ name: 'B', method: 'b' });
    expect(setContextSpy).toHaveBeenCalledWith('turbo_module', expect.objectContaining({ name: 'B', method: 'b' }));
  });

  it('does not redundantly re-sync the global top when popping leaves it on the same scope', () => {
    const outerId = pushTurboModuleCall({ name: 'M', method: 'outer', kind: 'sync', scope });
    const innerId = pushTurboModuleCall({ name: 'M', method: 'inner', kind: 'sync', scope });

    const setContextSpy = jest.spyOn(scope, 'setContext');
    popTurboModuleCall(innerId);

    // Exactly one setContext call to restore the 'outer' frame on `scope`.
    // (Without dedup, the global-top re-sync would fire a second redundant write.)
    expect(setContextSpy).toHaveBeenCalledTimes(1);
    expect(setContextSpy).toHaveBeenCalledWith('turbo_module', expect.objectContaining({ method: 'outer' }));

    popTurboModuleCall(outerId);
  });

  it('pops against the scope captured at push time, not the current scope', () => {
    const pushScope = new Scope();
    const otherScope = new Scope();

    const id = pushTurboModuleCall({ name: 'RNSentry', method: 'captureEnvelope', kind: 'async', scope: pushScope });
    expect(pushScope.getScopeData().contexts.turbo_module).toBeDefined();

    // Simulate a scope switch happening before the async call settles.
    // pop must still clear `pushScope`, not `otherScope`.
    popTurboModuleCall(id);

    // Scope.setContext(key, null) removes the entry, so contexts.turbo_module is undefined after clear.
    expect(pushScope.getScopeData().contexts.turbo_module).toBeUndefined();
    expect(pushScope.getScopeData().tags['turbo_module.name']).toBe('');
    // The unrelated scope was never written to.
    expect(otherScope.getScopeData().contexts.turbo_module).toBeUndefined();
    expect(otherScope.getScopeData().tags['turbo_module.name']).toBeUndefined();
  });

  it('exposes the new top of stack after popping a nested call', () => {
    const outer = pushTurboModuleCall({ name: 'RNSentry', method: 'outer', kind: 'sync', scope });
    const inner = pushTurboModuleCall({ name: 'RNSentry', method: 'inner', kind: 'sync', scope });

    expect(scope.getScopeData().tags['turbo_module.method']).toBe('inner');

    popTurboModuleCall(inner);

    expect(getActiveTurboModuleCall()?.callId).toBe(outer);
    expect(scope.getScopeData().tags['turbo_module.method']).toBe('outer');

    popTurboModuleCall(outer);
    expect(getActiveTurboModuleCall()).toBeUndefined();
  });

  it('handles out-of-order async completion', () => {
    const first = pushTurboModuleCall({ name: 'RNSentry', method: 'first', kind: 'async', scope });
    const second = pushTurboModuleCall({ name: 'RNSentry', method: 'second', kind: 'async', scope });

    // Inner async finishes first — pop the outer one.
    popTurboModuleCall(first);

    expect(getTurboModuleCallStack().map(c => c.callId)).toEqual([second]);
    expect(scope.getScopeData().tags['turbo_module.method']).toBe('second');
  });

  it('preserves context on a scope that still has a deeper active call after interleaved pop', () => {
    const scopeA = new Scope();
    const scopeB = new Scope();

    // Stack: [A@scopeA, B@scopeB, C@scopeA]. Pop C — scopeA must keep its
    // turbo_module context (because A is still active), and re-sync to A.
    const a = pushTurboModuleCall({ name: 'M', method: 'a', kind: 'sync', scope: scopeA });
    pushTurboModuleCall({ name: 'M', method: 'b', kind: 'sync', scope: scopeB });
    const c = pushTurboModuleCall({ name: 'M', method: 'c', kind: 'sync', scope: scopeA });

    expect(scopeA.getScopeData().tags['turbo_module.method']).toBe('c');

    popTurboModuleCall(c);

    // scopeA still has an active frame (A) — must NOT be cleared, and must be
    // re-synced to describe A, not C.
    expect(scopeA.getScopeData().contexts.turbo_module).toMatchObject({
      name: 'M',
      method: 'a',
      call_id: a,
    });
    expect(scopeA.getScopeData().tags['turbo_module.method']).toBe('a');

    // scopeB still has its own active frame and is untouched.
    expect(scopeB.getScopeData().tags['turbo_module.method']).toBe('b');
  });

  it('clears a scope only when no frames remain on it after an interleaved pop', () => {
    const scopeA = new Scope();
    const scopeB = new Scope();

    const a = pushTurboModuleCall({ name: 'M', method: 'a', kind: 'sync', scope: scopeA });
    const b = pushTurboModuleCall({ name: 'M', method: 'b', kind: 'sync', scope: scopeB });

    // Pop the bottom frame (A). scopeA should clear; scopeB untouched.
    popTurboModuleCall(a);

    expect(scopeA.getScopeData().contexts.turbo_module).toBeUndefined();
    expect(scopeA.getScopeData().tags['turbo_module.name']).toBe('');
    expect(scopeB.getScopeData().tags['turbo_module.method']).toBe('b');

    popTurboModuleCall(b);
  });

  it('is a no-op when popping an unknown id', () => {
    const id = pushTurboModuleCall({ name: 'RNSentry', method: 'a', kind: 'sync', scope });

    popTurboModuleCall(9999);

    expect(getActiveTurboModuleCall()?.callId).toBe(id);
  });

  it('relabels the active call kind and re-syncs the scope', () => {
    const id = pushTurboModuleCall({ name: 'RNSentry', method: 'captureEnvelope', kind: 'sync', scope });

    const relabelled = relabelTurboModuleCallKind(id, 'async');

    expect(relabelled).toBe(true);
    expect(getActiveTurboModuleCall()?.kind).toBe('async');
    expect(scope.getScopeData().contexts.turbo_module).toMatchObject({ kind: 'async' });
  });

  it('relabels a non-top frame without touching the scope context', () => {
    const outer = pushTurboModuleCall({ name: 'M', method: 'outer', kind: 'sync', scope });
    pushTurboModuleCall({ name: 'M', method: 'inner', kind: 'sync', scope });

    relabelTurboModuleCallKind(outer, 'async');

    // outer was relabelled
    expect(getTurboModuleCallStack().find(c => c.callId === outer)?.kind).toBe('async');
    // but the active scope context still describes the top of stack ('inner', sync)
    expect(scope.getScopeData().contexts.turbo_module).toMatchObject({ method: 'inner', kind: 'sync' });
  });

  it('relabel returns false for an unknown id', () => {
    expect(relabelTurboModuleCallKind(9999, 'async')).toBe(false);
  });

  it('assigns monotonically increasing call ids', () => {
    const a = pushTurboModuleCall({ name: 'M', method: 'a', kind: 'sync', scope });
    const b = pushTurboModuleCall({ name: 'M', method: 'b', kind: 'sync', scope });
    const c = pushTurboModuleCall({ name: 'M', method: 'c', kind: 'sync', scope });

    expect(b).toBe(a + 1);
    expect(c).toBe(b + 1);
  });
});
