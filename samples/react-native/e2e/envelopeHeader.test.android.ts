import { describe, it, beforeAll, expect, afterAll } from '@jest/globals';
import { Envelope } from '@sentry/core';
import { device } from 'detox';
import {
  createSentryServer,
  containingEventWithAndroidMessage,
} from './utils/mockedSentryServer';
import { HEADER } from './utils/consts';
import { tap } from './utils/tap';

describe('Capture message', () => {
  let sentryServer = createSentryServer();
  sentryServer.start();

  let envelope: Envelope;

  beforeAll(async () => {
    await device.launchApp();

    const envelopePromise = sentryServer.waitForEnvelope(
      containingEventWithAndroidMessage('Captured message'),
    );

    await tap('Capture message');
    envelope = await envelopePromise;
  });

  afterAll(async () => {
    await sentryServer.close();
  });

  it('contains event_id and sent_at in the envelope header', async () => {
    expect(envelope[HEADER]).toEqual(
      expect.objectContaining({
        event_id: expect.any(String),
        sent_at: expect.any(String),
      }),
    );
  });

  it('contains sdk info in the envelope header', async () => {
    expect(envelope[HEADER]).toEqual(
      expect.objectContaining({
        sdk: {
          name: 'sentry.javascript.react-native',
          version: expect.any(String),
        },
        sent_at: expect.any(String),
      }),
    );
  });

  it('contains trace info in the envelope header', async () => {
    expect(envelope[HEADER]).toEqual(
      expect.objectContaining({
        trace: {
          environment: expect.any(String),
          public_key: expect.any(String),
          replay_id: expect.any(String),
          trace_id: expect.any(String),
        },
      }),
    );
  });
});
