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
    popTurboModuleCall(id, scope);

    expect(getActiveTurboModuleCall()).toBeUndefined();
    expect(scope.getScopeData().contexts.turbo_module).toBeUndefined();
    expect(scope.getScopeData().tags['turbo_module.name']).toBeUndefined();
    expect(scope.getScopeData().tags['turbo_module.method']).toBeUndefined();
  });

  it('exposes the new top of stack after popping a nested call', () => {
    const outer = pushTurboModuleCall({ name: 'RNSentry', method: 'outer', kind: 'sync', scope });
    const inner = pushTurboModuleCall({ name: 'RNSentry', method: 'inner', kind: 'sync', scope });

    expect(scope.getScopeData().tags['turbo_module.method']).toBe('inner');

    popTurboModuleCall(inner, scope);

    expect(getActiveTurboModuleCall()?.callId).toBe(outer);
    expect(scope.getScopeData().tags['turbo_module.method']).toBe('outer');

    popTurboModuleCall(outer, scope);
    expect(getActiveTurboModuleCall()).toBeUndefined();
  });

  it('handles out-of-order async completion', () => {
    const first = pushTurboModuleCall({ name: 'RNSentry', method: 'first', kind: 'async', scope });
    const second = pushTurboModuleCall({ name: 'RNSentry', method: 'second', kind: 'async', scope });

    // Inner async finishes first — pop the outer one.
    popTurboModuleCall(first, scope);

    expect(getTurboModuleCallStack().map(c => c.callId)).toEqual([second]);
    expect(scope.getScopeData().tags['turbo_module.method']).toBe('second');
  });

  it('is a no-op when popping an unknown id', () => {
    const id = pushTurboModuleCall({ name: 'RNSentry', method: 'a', kind: 'sync', scope });

    popTurboModuleCall(9999, scope);

    expect(getActiveTurboModuleCall()?.callId).toBe(id);
  });

  it('relabels the active call kind and re-syncs the scope', () => {
    const id = pushTurboModuleCall({ name: 'RNSentry', method: 'captureEnvelope', kind: 'sync', scope });

    const relabelled = relabelTurboModuleCallKind(id, 'async', scope);

    expect(relabelled).toBe(true);
    expect(getActiveTurboModuleCall()?.kind).toBe('async');
    expect(scope.getScopeData().contexts.turbo_module).toMatchObject({ kind: 'async' });
  });

  it('relabels a non-top frame without touching the scope context', () => {
    const outer = pushTurboModuleCall({ name: 'M', method: 'outer', kind: 'sync', scope });
    pushTurboModuleCall({ name: 'M', method: 'inner', kind: 'sync', scope });

    relabelTurboModuleCallKind(outer, 'async', scope);

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
