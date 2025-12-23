import { describe, it, beforeAll, expect, afterAll } from '@jest/globals';
import { Envelope, EventItem } from '@sentry/core';

import {
  createSentryServer,
  containingEventWithMessage,
} from '../../utils/mockedSentryServer';
import { getItemOfTypeFrom } from '../../utils/event';
import { maestro } from '../../utils/maestro';
import { isAutoInitTest } from '../../utils/environment';

describe('Capture message', () => {
  let sentryServer = createSentryServer();

  let envelope: Envelope;

  beforeAll(async () => {
    await sentryServer.start();

    const envelopePromise = sentryServer.waitForEnvelope(
      containingEventWithMessage('Captured message'),
    );

    if (isAutoInitTest()) {
      await maestro('tests/captureMessage/captureMessage.test.ios.auto.yml');
    } else {
      await maestro('tests/captureMessage/captureMessage.test.yml');
    }

    envelope = await envelopePromise;
  }, 240000); // 240 seconds timeout for iOS event delivery

  afterAll(async () => {
    await sentryServer.close();
  });

  it('envelope contains message event', async () => {
    const item = getItemOfTypeFrom<EventItem>(envelope, 'event');

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

  it('contains device context', async () => {
    const item = getItemOfTypeFrom<EventItem>(envelope, 'event');

    expect(item?.[1]).toEqual(
      expect.objectContaining({
        contexts: expect.objectContaining({
          device: expect.objectContaining({
            arch: expect.any(String),
            family: expect.any(String),
            free_memory: expect.any(Number),
            locale: expect.any(String),
            memory_size: expect.any(Number),
            model: expect.any(String),
            model_id: expect.any(String),
            processor_count: expect.any(Number),
            simulator: expect.any(Boolean),
            thermal_state: expect.any(String),
            usable_memory: expect.any(Number),
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
            app_build: expect.any(String),
            app_identifier: expect.any(String),
            app_name: expect.any(String),
            app_start_time: expect.any(String),
            app_version: expect.any(String),
            in_foreground: expect.any(Boolean),
            // view_names: ['ErrorsScreen-jn5qquvH9Nz'], // TODO: fix this generated hash should not be part of the name
          }),
        }),
      }),
    );
  });

  it('contains os context', async () => {
    const item = getItemOfTypeFrom<EventItem>(envelope, 'event');

    expect(item?.[1]).toEqual(
      expect.objectContaining({
        contexts: expect.objectContaining({
          os: {
            build: expect.any(String),
            kernel_version: expect.any(String),
            name: 'iOS',
            rooted: expect.any(Boolean),
            version: expect.any(String),
          },
        }),
      }),
    );
  });

  it('contains react native context', async () => {
    const item = getItemOfTypeFrom<EventItem>(envelope, 'event');

    expect(item?.[1]).toEqual(
      expect.objectContaining({
        contexts: expect.objectContaining({
          react_native_context: {
            expo: false,
            fabric: expect.any(Boolean),
            hermes_debug_info: expect.any(Boolean),
            hermes_version: expect.any(String),
            js_engine: 'hermes',
            react_native_version: expect.any(String),
            turbo_module: expect.any(Boolean),
          },
        }),
      }),
    );
  });
});
