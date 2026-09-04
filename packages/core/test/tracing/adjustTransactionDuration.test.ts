import { getClient, spanToStaticSpanJSON, startSpanManual } from '@sentry/core';

import { adjustTransactionDuration } from '../../src/js/tracing/onSpanEndUtils';
import { setupTestClient } from '../mocks/client';

jest.mock('react-native', () => {
  return {
    AppState: {
      isAvailable: true,
      currentState: 'active',
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    },
    Platform: { OS: 'ios' },
    NativeModules: {
      RNSentry: {},
    },
  };
});

describe('adjustTransactionDuration', () => {
  beforeEach(() => {
    setupTestClient();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('marks span as deadline_exceeded when duration exceeds maxDurationMs', () => {
    const client = getClient()!;
    const span = startSpanManual({ name: 'Test Transaction', forceTransaction: true }, span => span);

    const maxDurationMs = 60_000; // 60 seconds
    adjustTransactionDuration(client, span, maxDurationMs);

    // End the span 120 seconds after it started (exceeds 60s max)
    const startTimestamp = spanToStaticSpanJSON(span).start_timestamp;
    span.end(startTimestamp + 120);

    expect(spanToStaticSpanJSON(span).status).toBe('deadline_exceeded');
    expect(spanToStaticSpanJSON(span).data).toMatchObject({ maxTransactionDurationExceeded: 'true' });
  });

  it('does not mark span as deadline_exceeded when duration is within maxDurationMs', () => {
    const client = getClient()!;
    const span = startSpanManual({ name: 'Test Transaction', forceTransaction: true }, span => span);

    const maxDurationMs = 60_000; // 60 seconds
    adjustTransactionDuration(client, span, maxDurationMs);

    // End the span 30 seconds after it started (within 60s max)
    const startTimestamp = spanToStaticSpanJSON(span).start_timestamp;
    span.end(startTimestamp + 30);

    expect(spanToStaticSpanJSON(span).status).not.toBe('deadline_exceeded');
    expect(spanToStaticSpanJSON(span).data).not.toMatchObject({ maxTransactionDurationExceeded: 'true' });
  });

  it('does not mark span as deadline_exceeded when duration equals maxDurationMs exactly', () => {
    const client = getClient()!;
    const span = startSpanManual({ name: 'Test Transaction', forceTransaction: true }, span => span);

    const maxDurationMs = 60_000; // 60 seconds
    adjustTransactionDuration(client, span, maxDurationMs);

    // End the span exactly 60 seconds after it started
    const startTimestamp = spanToStaticSpanJSON(span).start_timestamp;
    span.end(startTimestamp + 60);

    expect(spanToStaticSpanJSON(span).status).not.toBe('deadline_exceeded');
    expect(spanToStaticSpanJSON(span).data).not.toMatchObject({ maxTransactionDurationExceeded: 'true' });
  });

  it('marks span as deadline_exceeded when duration is negative', () => {
    const client = getClient()!;
    const span = startSpanManual({ name: 'Test Transaction', forceTransaction: true }, span => span);

    const maxDurationMs = 60_000;
    adjustTransactionDuration(client, span, maxDurationMs);

    // End the span before it started (negative duration)
    const startTimestamp = spanToStaticSpanJSON(span).start_timestamp;
    span.end(startTimestamp - 10);

    expect(spanToStaticSpanJSON(span).status).toBe('deadline_exceeded');
    expect(spanToStaticSpanJSON(span).data).toMatchObject({ maxTransactionDurationExceeded: 'true' });
  });

  it('correctly handles maxDurationMs in milliseconds not seconds', () => {
    const client = getClient()!;
    const span = startSpanManual({ name: 'Test Transaction', forceTransaction: true }, span => span);

    // maxDurationMs = 600_000 ms = 600 seconds = 10 minutes
    // A span lasting 601 seconds should exceed this limit
    const maxDurationMs = 600_000;
    adjustTransactionDuration(client, span, maxDurationMs);

    const startTimestamp = spanToStaticSpanJSON(span).start_timestamp;
    span.end(startTimestamp + 601);

    expect(spanToStaticSpanJSON(span).status).toBe('deadline_exceeded');
    expect(spanToStaticSpanJSON(span).data).toMatchObject({ maxTransactionDurationExceeded: 'true' });
  });

  it('does not mark span when duration is 599 seconds with 600_000ms max', () => {
    const client = getClient()!;
    const span = startSpanManual({ name: 'Test Transaction', forceTransaction: true }, span => span);

    // maxDurationMs = 600_000 ms = 600 seconds
    // A span lasting 599 seconds should NOT exceed this limit
    const maxDurationMs = 600_000;
    adjustTransactionDuration(client, span, maxDurationMs);

    const startTimestamp = spanToStaticSpanJSON(span).start_timestamp;
    span.end(startTimestamp + 599);

    expect(spanToStaticSpanJSON(span).status).not.toBe('deadline_exceeded');
    expect(spanToStaticSpanJSON(span).data).not.toMatchObject({ maxTransactionDurationExceeded: 'true' });
  });

  it('does not affect spans from other transactions', () => {
    const client = getClient()!;
    const trackedSpan = startSpanManual({ name: 'Tracked Transaction', forceTransaction: true }, span => span);
    const otherSpan = startSpanManual({ name: 'Other Transaction', forceTransaction: true }, span => span);

    const maxDurationMs = 60_000;
    adjustTransactionDuration(client, trackedSpan, maxDurationMs);

    // End the other span with a duration that exceeds the limit
    const otherStartTimestamp = spanToStaticSpanJSON(otherSpan).start_timestamp;
    otherSpan.end(otherStartTimestamp + 120);

    // Other span should not be affected by adjustTransactionDuration
    expect(spanToStaticSpanJSON(otherSpan).status).not.toBe('deadline_exceeded');

    // End tracked span within limits
    const trackedStartTimestamp = spanToStaticSpanJSON(trackedSpan).start_timestamp;
    trackedSpan.end(trackedStartTimestamp + 30);

    expect(spanToStaticSpanJSON(trackedSpan).status).not.toBe('deadline_exceeded');
  });

  it('handles very short maxDurationMs values', () => {
    const client = getClient()!;
    const span = startSpanManual({ name: 'Test Transaction', forceTransaction: true }, span => span);

    // 100ms max duration
    const maxDurationMs = 100;
    adjustTransactionDuration(client, span, maxDurationMs);

    // End after 1 second (1000ms > 100ms)
    const startTimestamp = spanToStaticSpanJSON(span).start_timestamp;
    span.end(startTimestamp + 1);

    expect(spanToStaticSpanJSON(span).status).toBe('deadline_exceeded');
    expect(spanToStaticSpanJSON(span).data).toMatchObject({ maxTransactionDurationExceeded: 'true' });
  });
});
