import type { Event } from '@sentry/core';

import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { registerReplayTraceIdForEvent } from '../../src/js/replay/replayTraceIds';
import { NATIVE } from '../../src/js/wrapper';

jest.mock('../../src/js/wrapper');

describe('registerReplayTraceIdForEvent', () => {
  const TRACE_ID = 'd6566d2f24e848fe864f8d4df192d67c';
  const mockRegister = NATIVE.registerReplayTraceId as jest.MockedFunction<typeof NATIVE.registerReplayTraceId>;

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('forwards the trace id to native when a replay is active', () => {
    // Arrange
    const event = { contexts: { trace: { trace_id: TRACE_ID } } } as unknown as Event;

    // Act
    registerReplayTraceIdForEvent(event, 'active-replay-id');

    // Assert
    expect(mockRegister).toHaveBeenCalledWith(TRACE_ID);
  });

  it('does not forward when no replay is active', () => {
    // Arrange
    const event = { contexts: { trace: { trace_id: TRACE_ID } } } as unknown as Event;

    // Act
    registerReplayTraceIdForEvent(event, null);

    // Assert
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('does not forward when the event carries no trace id', () => {
    // Arrange
    const event = { event_id: 'no-trace' } as Event;

    // Act
    registerReplayTraceIdForEvent(event, 'active-replay-id');

    // Assert
    expect(mockRegister).not.toHaveBeenCalled();
  });
});
