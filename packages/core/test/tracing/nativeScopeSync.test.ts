import { getCurrentScope, SentryNonRecordingSpan, startInactiveSpan } from '@sentry/core';

jest.mock('../../src/js/wrapper', () => ({
  NATIVE: {
    enableNative: true,
    setCurrentScopePropagationContext: jest.fn(),
  },
}));

jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  Platform: { OS: 'ios' },
  NativeModules: { RNSentry: {} },
}));

import { startIdleNavigationSpan, syncPropagationContextToNative } from '../../src/js/tracing/span';
import { NATIVE } from '../../src/js/wrapper';
import { setupTestClient } from '../mocks/client';

const mockSetPropagationContext = NATIVE.setCurrentScopePropagationContext as jest.Mock;

describe('syncPropagationContextToNative', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupTestClient({ tracesSampleRate: 1.0 });
  });

  it('calls NATIVE.setCurrentScopePropagationContext with the span traceId and spanId', () => {
    const span = startInactiveSpan({ name: 'root', forceTransaction: true });
    const ctx = span.spanContext();

    syncPropagationContextToNative(span);

    expect(mockSetPropagationContext).toHaveBeenCalledTimes(1);
    expect(mockSetPropagationContext).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: ctx.traceId,
        spanId: ctx.spanId,
      }),
    );

    span.end();
  });

  it('calls NATIVE.setCurrentScopePropagationContext for a SentryNonRecordingSpan', () => {
    const nonRecording = new SentryNonRecordingSpan();
    const ctx = nonRecording.spanContext();

    syncPropagationContextToNative(nonRecording);

    expect(mockSetPropagationContext).toHaveBeenCalledTimes(1);
    expect(mockSetPropagationContext).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: ctx.traceId,
        spanId: ctx.spanId,
      }),
    );
  });

  it('passes sampled and sampleRand from the current scope propagation context', () => {
    const span = startInactiveSpan({ name: 'root', forceTransaction: true });
    const propagationCtx = getCurrentScope().getPropagationContext();

    syncPropagationContextToNative(span);

    expect(mockSetPropagationContext).toHaveBeenCalledWith(
      expect.objectContaining({
        sampled: expect.any(Boolean),
        sampleRand: propagationCtx.sampleRand ?? expect.any(Number),
      }),
    );

    span.end();
  });

  it('does not call NATIVE.setCurrentScopePropagationContext just from creating an inactive forceTransaction root span', () => {
    // Regression test for background roots (app-start, expo-updates) created via
    // startInactiveSpan({ forceTransaction: true }) - they must not sync to native
    // on their own; only startIdleSpan calls syncPropagationContextToNative explicitly.
    const span = startInactiveSpan({ name: 'app-start', forceTransaction: true });

    expect(mockSetPropagationContext).not.toHaveBeenCalled();

    span.end();
  });

  it('does not overwrite an active navigation trace in native when an app-start-like background root starts', () => {
    // Regression test: a background root (app-start / expo-updates, both created via
    // startInactiveSpan({ forceTransaction: true })) used to clobber the native
    // propagation context of an already-active navigation trace.
    const navSpan = startIdleNavigationSpan({ name: 'test' });
    const navCtx = navSpan!.spanContext();

    expect(mockSetPropagationContext).toHaveBeenCalledTimes(1);
    expect(mockSetPropagationContext).toHaveBeenLastCalledWith(
      expect.objectContaining({ traceId: navCtx.traceId, spanId: navCtx.spanId }),
    );

    const appStartSpan = startInactiveSpan({ name: 'App Start', forceTransaction: true, op: 'app.start.cold' });

    // The background app-start root must not have pushed its own trace to native.
    expect(mockSetPropagationContext).toHaveBeenCalledTimes(1);

    appStartSpan.end();
    navSpan!.end();
  });
});
