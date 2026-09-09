import type { Client } from '@sentry/core';

import {
  getCurrentScope,
  SentryNonRecordingSpan,
  startInactiveSpan,
  withActiveSpan,
} from '@sentry/core';

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

import { syncPropagationContextToNative } from '../../src/js/tracing/span';
import { NATIVE } from '../../src/js/wrapper';
import { setupTestClient } from '../mocks/client';

const mockSetPropagationContext = NATIVE.setCurrentScopePropagationContext as jest.Mock;

describe('syncPropagationContextToNative', () => {
  let client: Client;

  beforeEach(() => {
    jest.clearAllMocks();
    client = setupTestClient({ tracesSampleRate: 1.0 });
    syncPropagationContextToNative(client);
  });

  it('calls NATIVE.setCurrentScopePropagationContext when an active root span starts', () => {
    const span = startInactiveSpan({ name: 'root', forceTransaction: true });
    withActiveSpan(span, () => {
      client.emit('spanStart', span);
    });

    const ctx = span.spanContext();
    expect(mockSetPropagationContext).toHaveBeenCalledTimes(1);
    expect(mockSetPropagationContext).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: ctx.traceId,
        spanId: ctx.spanId,
      }),
    );

    span.end();
  });

  it('does not call NATIVE.setCurrentScopePropagationContext for child spans', () => {
    const root = startInactiveSpan({ name: 'root', forceTransaction: true });
    mockSetPropagationContext.mockClear();

    const child = startInactiveSpan({ name: 'child', parentSpan: root });
    expect(mockSetPropagationContext).not.toHaveBeenCalled();

    child.end();
    root.end();
  });

  it('does not call NATIVE.setCurrentScopePropagationContext for inactive forceTransaction roots', () => {
    // Inactive roots (app start, expo-updates) must not clobber the native trace
    // of an in-flight navigation span.
    const span = startInactiveSpan({ name: 'app-start', forceTransaction: true });
    // span is NOT the active span here
    expect(mockSetPropagationContext).not.toHaveBeenCalled();
    span.end();
  });

  it('calls NATIVE.setCurrentScopePropagationContext for SentryNonRecordingSpan when it is active', () => {
    // SentryNonRecordingSpan is made active by the SDK when sample rate is 0%;
    // native scope must still be updated so requests don't use a stale traceId.
    const nonRecording = new SentryNonRecordingSpan();
    const ctx = nonRecording.spanContext();

    withActiveSpan(nonRecording, () => {
      client.emit('spanStart', nonRecording);
    });

    expect(mockSetPropagationContext).toHaveBeenCalledTimes(1);
    expect(mockSetPropagationContext).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: ctx.traceId,
        spanId: ctx.spanId,
      }),
    );
  });

  it('passes sampled and sampleRand from the scope propagation context', () => {
    const span = startInactiveSpan({ name: 'root', forceTransaction: true });
    const propagationCtx = getCurrentScope().getPropagationContext();

    withActiveSpan(span, () => {
      client.emit('spanStart', span);
    });

    expect(mockSetPropagationContext).toHaveBeenCalledWith(
      expect.objectContaining({
        sampled: expect.any(Boolean),
        sampleRand: propagationCtx.sampleRand ?? expect.any(Number),
      }),
    );

    span.end();
  });

  it('fires once per active root span start', () => {
    const span1 = startInactiveSpan({ name: 'first', forceTransaction: true });
    withActiveSpan(span1, () => {
      client.emit('spanStart', span1);
    });
    span1.end();

    const span2 = startInactiveSpan({ name: 'second', forceTransaction: true });
    withActiveSpan(span2, () => {
      client.emit('spanStart', span2);
    });
    span2.end();

    expect(mockSetPropagationContext).toHaveBeenCalledTimes(2);
    expect(mockSetPropagationContext.mock.calls[0][0].spanId).toBe(span1.spanContext().spanId);
    expect(mockSetPropagationContext.mock.calls[1][0].spanId).toBe(span2.spanContext().spanId);
  });
});
