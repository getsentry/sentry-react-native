import { describe, it, beforeAll, expect } from '@jest/globals';
import { Envelope } from '@sentry/core';
import { device, element, by } from 'detox';
import {
  createSentryServer,
  containingEvent,
} from './utils/mockedSentryServer';
import { HEADER, ITEMS } from './utils/types';

describe('Capture message', () => {
  let sentryServer = createSentryServer();
  sentryServer.start();

  let envelope: Envelope;

  beforeAll(async () => {
    await device.launchApp();

    const envelopePromise = sentryServer.waitForEnvelope(containingEvent);
    await element(by.text('Capture message')).tap();
    envelope = await envelopePromise;
  });

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
