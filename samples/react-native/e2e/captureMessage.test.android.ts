import { describe, it, beforeAll, expect, afterAll } from '@jest/globals';
import { Envelope, EventItem } from '@sentry/core';
import { device } from 'detox';
import {
  createSentryServer,
  containingEventWithAndroidMessage,
} from './utils/mockedSentryServer';
import { tap } from './utils/tap';
import { getItemOfTypeFrom } from './utils/event';

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
            battery_temperature: expect.any(Number),
            boot_time: expect.any(String),
            brand: expect.any(String),
            charging: expect.any(Boolean),
            connection_type: expect.any(String),
            family: expect.any(String),
            free_memory: expect.any(Number),
            free_storage: expect.any(Number),
            id: expect.any(String),
            language: expect.any(String),
            locale: expect.any(String),
            low_memory: expect.any(Boolean),
            manufacturer: expect.any(String),
            memory_size: expect.any(Number),
            model: expect.any(String),
            model_id: expect.any(String),
            online: expect.any(Boolean),
            orientation: expect.any(String),
            processor_count: expect.any(Number),
            processor_frequency: expect.any(Number),
            screen_density: expect.any(Number),
            screen_dpi: expect.any(Number),
            screen_height_pixels: expect.any(Number),
            screen_width_pixels: expect.any(Number),
            simulator: expect.any(Boolean),
            storage_size: expect.any(Number),
            timezone: expect.any(String),
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
            view_names: ['ErrorsScreen'],
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
            name: 'Android',
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
