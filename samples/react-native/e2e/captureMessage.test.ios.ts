import { describe, it, beforeAll, expect } from '@jest/globals';
import { Envelope } from '@sentry/core';
import { device } from 'detox';
import {
  createSentryServer,
  containingEvent,
} from './utils/mockedSentryServer';
import { HEADER, ITEMS, TIMEOUT_10_MINUTES } from './utils/consts';
import { tap } from './utils/tap';

describe('Capture message', () => {
  let sentryServer = createSentryServer();
  sentryServer.start();

  let envelope: Envelope;

  beforeAll(async () => {
    await device.launchApp();

    const envelopePromise = sentryServer.waitForEnvelope(containingEvent);
    await tap('Capture message');
    envelope = await envelopePromise;
  }, TIMEOUT_10_MINUTES);

  afterAll(async () => {
    await sentryServer.close();
  });

  it('envelope contains message event', async () => {
    const item = (envelope[ITEMS] as [{ type?: string }, unknown][]).find(
      i => i[HEADER].type === 'event',
    );

    expect(item).toEqual([
      {
        length: expect.any(Number),
        type: 'event',
      },
      expect.objectContaining({
        level: 'info',
        message: 'Captured message',
        platform: 'javascript',
      }),
    ]);
  });
});
