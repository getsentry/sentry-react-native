import type { Event } from '@sentry/core';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Client, createTransport } from '@sentry/core';

import { mobileReplayIntegration } from '../../src/js/replay/mobilereplay';
import * as environment from '../../src/js/utils/environment';
import { NATIVE } from '../../src/js/wrapper';

jest.mock('../../src/js/wrapper');

/**
 * Regression coverage for https://github.com/getsentry/sentry-react-native/issues/6598
 *
 * Drives the REAL @sentry/core capture pipeline so the production ordering
 * applies: _prepareEvent -> beforeSend -> sampleRate drop -> sendEvent
 * (-> afterSendEvent). The mobile replay integration links the event to the
 * buffered replay id inside the wrapped `beforeSend`, but defers the native
 * replay flush to `afterSendEvent`, which only fires for events that survive
 * sampling and are actually sent. So an error dropped by `sampleRate` must not
 * flush (and orphan) a replay.
 */

const BUFFERED_REPLAY_ID = 'buffered-replay-id';

// Minimal concrete client over the real @sentry/core base pipeline.
class TestClient extends Client<any> {
  public eventFromException(exception: any): PromiseLike<Event> {
    return Promise.resolve({
      event_id: 'test-event-id',
      exception: { values: [{ type: 'Error', value: String(exception?.message ?? exception) }] },
    });
  }
  public eventFromMessage(message: string): PromiseLike<Event> {
    return Promise.resolve({ event_id: 'test-event-id', message });
  }
}

function makeClient(sampleRate: number, sentEnvelopes: unknown[]): TestClient {
  return new TestClient({
    dsn: 'https://public@example.com/1',
    enableSend: true,
    sampleRate,
    integrations: [],
    stackParser: () => [],
    transport: opts =>
      createTransport(opts, req => {
        sentEnvelopes.push(req.body);
        return Promise.resolve({ statusCode: 200 });
      }),
  });
}

describe('Issue 6598 — on-error replay must not orphan when sampleRate drops the error', () => {
  let mockCaptureReplay: jest.MockedFunction<typeof NATIVE.captureReplay>;
  let mockGetCurrentReplayId: jest.MockedFunction<typeof NATIVE.getCurrentReplayId>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(environment, 'isExpoGo').mockReturnValue(false);
    jest.spyOn(environment, 'notMobileOs').mockReturnValue(false);
    mockCaptureReplay = NATIVE.captureReplay as jest.MockedFunction<typeof NATIVE.captureReplay>;
    mockCaptureReplay.mockResolvedValue('test-replay-id');
    mockGetCurrentReplayId = NATIVE.getCurrentReplayId as jest.MockedFunction<typeof NATIVE.getCurrentReplayId>;
    // A buffer (on-error) replay is recording: the native bridge returns the
    // buffered id, but nothing has been flushed/uploaded yet.
    mockGetCurrentReplayId.mockReturnValue(BUFFERED_REPLAY_ID);
  });

  afterEach(() => jest.restoreAllMocks());

  it('control: sampleRate = 1.0 → event sent, replay flushed, and event linked to the replay', async () => {
    const sent: unknown[] = [];
    const client = makeClient(1.0, sent);

    let sentEvent: Event | undefined;
    client.on('beforeSendEvent', (event: Event) => {
      sentEvent = event;
    });

    const integration = mobileReplayIntegration();
    integration.setup?.(client);

    client.captureException(new Error('boom'));
    await client.flush(2000);

    // Event survived sampling and reached the transport...
    expect(sent.length).toBe(1);
    // ...the event was linked to the buffered replay in beforeSend...
    expect(sentEvent?.contexts?.replay?.replay_id).toBe(BUFFERED_REPLAY_ID);
    // ...and the buffered replay was flushed exactly once (in afterSendEvent).
    expect(mockCaptureReplay).toHaveBeenCalledTimes(1);
  });

  it('fix: sampleRate = 0.0 → event dropped and replay is NOT flushed (no orphan)', async () => {
    const sent: unknown[] = [];
    const client = makeClient(0.0, sent); // 0.0 => always dropped by sampleRate

    const integration = mobileReplayIntegration();
    integration.setup?.(client);

    client.captureException(new Error('boom'));
    await client.flush(2000);

    // The event never reached the transport (dropped by sampleRate after beforeSend)...
    expect(sent.length).toBe(0);
    // ...and crucially the native replay buffer was NOT flushed, so no dangling
    // replay is uploaded and no replay quota is burned. This is the fix.
    expect(mockCaptureReplay).not.toHaveBeenCalled();
  });

  it('does not flush when there is no active recording', async () => {
    mockGetCurrentReplayId.mockReturnValue(null);
    const sent: unknown[] = [];
    const client = makeClient(1.0, sent);

    const integration = mobileReplayIntegration();
    integration.setup?.(client);

    client.captureException(new Error('boom'));
    await client.flush(2000);

    // Event is still sent, but with no buffered replay there is nothing to link
    // or flush.
    expect(sent.length).toBe(1);
    expect(mockCaptureReplay).not.toHaveBeenCalled();
  });
});
