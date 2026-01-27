import { describe, it, beforeAll, expect, afterAll } from '@jest/globals';
import { Envelope, EventItem } from '@sentry/core';

import {
  createSentryServer,
  containingEvent,
} from '../../utils/mockedSentryServer';
import { getItemOfTypeFrom } from '../../utils/event';
import { maestro } from '../../utils/maestro';

describe('Capture app start crash (Android)', () => {
  let sentryServer = createSentryServer();

  let envelope: Envelope;

  beforeAll(async () => {
    await sentryServer.start();

    const envelopePromise = sentryServer.waitForEnvelope(containingEvent);

    await maestro('tests/captureAppStartCrash/captureAppStartCrash.test.android.manual.yml');

    envelope = await envelopePromise;
  }, 300000); // 5 minutes timeout for crash handling

  afterAll(async () => {
    await sentryServer.close();
  });

  it('envelope contains sdk metadata', async () => {
    const item = getItemOfTypeFrom<EventItem>(envelope, 'event');

    expect(item).toEqual([
      {
        content_type: 'application/json',
        length: expect.any(Number),
        type: 'event',
      },
      expect.objectContaining({
        platform: 'java',
        sdk: expect.objectContaining({
          name: 'sentry.java.android.react-native',
          packages: expect.arrayContaining([
            expect.objectContaining({
              name: 'maven:io.sentry:sentry-android-core',
            }),
            expect.objectContaining({
              name: 'npm:@sentry/react-native',
            }),
          ]),
        }),
      }),
    ]);
  });

  it('captures app start crash exception', async () => {
    const item = getItemOfTypeFrom<EventItem>(envelope, 'event');

    expect(item?.[1]).toEqual(
      expect.objectContaining({
        exception: expect.objectContaining({
          values: expect.arrayContaining([
            expect.objectContaining({
              type: 'RuntimeException',
              value: 'This was intentional test crash before JS started.',
              mechanism: expect.objectContaining({
                handled: false,
                type: 'UncaughtExceptionHandler',
              }),
            }),
          ]),
        }),
      }),
    );
  });

  it('crash happened before JS was loaded', async () => {
    const item = getItemOfTypeFrom<EventItem>(envelope, 'event');

    // Verify this is a native crash, not from JavaScript
    expect(item?.[1]).toEqual(
      expect.objectContaining({
        platform: 'java',
      }),
    );

    // Should not have JavaScript context since JS wasn't loaded yet
    expect(item?.[1]?.contexts?.react_native_context).toBeUndefined();
  });

  it('contains device and app context', async () => {
    const item = getItemOfTypeFrom<EventItem>(envelope, 'event');

    expect(item?.[1]).toEqual(
      expect.objectContaining({
        contexts: expect.objectContaining({
          device: expect.objectContaining({
            brand: expect.any(String),
            manufacturer: expect.any(String),
            model: expect.any(String),
          }),
          app: expect.objectContaining({
            app_identifier: 'io.sentry.reactnative.sample',
            app_name: expect.any(String),
            app_version: expect.any(String),
          }),
          os: expect.objectContaining({
            name: 'Android',
            version: expect.any(String),
          }),
        }),
      }),
    );
  });
});
