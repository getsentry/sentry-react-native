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
          features: [],
          integrations: [],
          name: 'sentry.javascript.react-native',
          packages: [],
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
          sample_rate: '1',
          sampled: '1',
          trace_id: expect.any(String),
          transaction: 'ErrorsScreen',
        },
      }),
    );
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
