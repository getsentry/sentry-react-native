import type { Client } from '@sentry/core';

import {
  getCurrentScope,
  SentryNonRecordingSpan,
  startInactiveSpan,
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

import { NATIVE } from '../../src/js/wrapper';
import { syncPropagationContextToNative } from '../../src/js/tracing/span';
import { setupTestClient } from '../mocks/client';

const mockSetPropagationContext = NATIVE.setCurrentScopePropagationContext as jest.Mock;

describe('syncPropagationContextToNative', () => {
  let client: Client;

  beforeEach(() => {
    jest.clearAllMocks();
    client = setupTestClient({ tracesSampleRate: 1.0 });
    syncPropagationContextToNative(client);
  });

  it('calls NATIVE.setCurrentScopePropagationContext when a root span starts', () => {
    const span = startInactiveSpan({ name: 'root', forceTransaction: true });
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

  it('does not call NATIVE.setCurrentScopePropagationContext for SentryNonRecordingSpan', () => {
    const nonRecording = new SentryNonRecordingSpan();
    client.emit('spanStart', nonRecording);

    expect(mockSetPropagationContext).not.toHaveBeenCalled();
  });

  it('passes sampled and sampleRand from the scope propagation context', () => {
    const span = startInactiveSpan({ name: 'root', forceTransaction: true });
    const propagationCtx = getCurrentScope().getPropagationContext();

    expect(mockSetPropagationContext).toHaveBeenCalledWith(
      expect.objectContaining({
        sampled: expect.any(Boolean),
        sampleRand: propagationCtx.sampleRand ?? expect.any(Number),
      }),
    );

    span.end();
  });

  it('fires once per root span start', () => {
    const span1 = startInactiveSpan({ name: 'first', forceTransaction: true });
    span1.end();

    const span2 = startInactiveSpan({ name: 'second', forceTransaction: true });
    span2.end();

    expect(mockSetPropagationContext).toHaveBeenCalledTimes(2);
    expect(mockSetPropagationContext.mock.calls[0][0].spanId).toBe(
      span1.spanContext().spanId,
    );
    expect(mockSetPropagationContext.mock.calls[1][0].spanId).toBe(
      span2.spanContext().spanId,
    );
  });
});
