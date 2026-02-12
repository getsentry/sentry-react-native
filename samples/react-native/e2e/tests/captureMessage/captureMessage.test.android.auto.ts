import { describe, it, beforeAll, expect, afterAll } from '@jest/globals';
import { Envelope, EventItem } from '@sentry/core';

import {
  createSentryServer,
  containingEventWithAndroidMessage,
} from '../../utils/mockedSentryServer';
import { getItemOfTypeFrom } from '../../utils/event';
import { maestro } from '../../utils/maestro';

describe('Capture message (auto init from JS)', () => {
  let sentryServer = createSentryServer();

  let envelope: Envelope;

  beforeAll(async () => {
    await sentryServer.start();

    const envelopePromise = sentryServer.waitForEnvelope(
      containingEventWithAndroidMessage('Captured message'),
    );

    await maestro('tests/captureMessage/captureMessage.test.yml');

    envelope = await envelopePromise;
  }, 240000); // 240 seconds timeout

  afterAll(async () => {
    await sentryServer.close();
  });

  it('envelope contains message event', async () => {
    const item = getItemOfTypeFrom<EventItem>(envelope, 'event');

    expect(item).toEqual([
      {
        content_type: 'application/json',
        length: expect.any(Number),
        type: 'event',
      },
      expect.objectContaining({
        level: 'info',
        message: {
          message: 'Captured message',
        },
        platform: 'javascript',
      }),
    ]);
  });

  it('contains device context', async () => {
    const item = getItemOfTypeFrom<EventItem>(envelope, 'event');

    expect(item?.[1]).toEqual(
      expect.objectContaining({
        contexts: expect.objectContaining({
          device: expect.objectContaining({
            battery_level: expect.any(Number),
            brand: expect.any(String),
            family: expect.any(String),
            manufacturer: expect.any(String),
            model: expect.any(String),
            simulator: expect.any(Boolean),
          }),
        }),
      }),
    );
  });

  it('contains app context', async () => {
    const item = getItemOfTypeFrom<EventItem>(envelope, 'event');

    expect(item?.[1]).toEqual(
      expect.objectContaining({
        contexts: expect.objectContaining({
          app: expect.objectContaining({
            app_identifier: expect.any(String),
            app_name: expect.any(String),
            app_version: expect.any(String),
          }),
        }),
      }),
    );
  });

  it('SDK initialized from JavaScript (auto init)', async () => {
    const item = getItemOfTypeFrom<EventItem>(envelope, 'event');

    // Verify that native SDK was NOT initialized before JS
    // When auto init, the SDK is initialized from JavaScript
    expect(item?.[1]).toEqual(
      expect.objectContaining({
        sdk: expect.objectContaining({
          name: 'sentry.javascript.react-native',
        }),
      }),
    );
  });
});
