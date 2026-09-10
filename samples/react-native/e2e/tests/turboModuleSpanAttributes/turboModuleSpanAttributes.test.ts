import { describe, it, beforeAll, expect, afterAll } from '@jest/globals';
import { Envelope, EventItem } from '@sentry/core';

import { getItemOfTypeFrom } from '../../utils/event';
import { maestro } from '../../utils/maestro';
import {
  createSentryServer,
  containingTransactionWithName,
} from '../../utils/mockedSentryServer';

const TURBO_MODULE_SPAN_NAME = 'turbo_module.sample';

/** 5 synchronous `NativeSampleModule.add` calls plus one async `getPlatform`. */
const EXPECTED_CALL_COUNT = 6;

describe('TurboModule span attributes', () => {
  let sentryServer = createSentryServer();

  let envelope: Envelope;

  beforeAll(async () => {
    await sentryServer.start();

    const envelopePromise = sentryServer.waitForEnvelope(
      containingTransactionWithName(TURBO_MODULE_SPAN_NAME),
    );

    await maestro(
      'tests/turboModuleSpanAttributes/turboModuleSpanAttributes.test.yml',
    );

    envelope = await envelopePromise;
  }, 240000); // 240 seconds timeout for iOS event delivery

  afterAll(async () => {
    await sentryServer.close();
  });

  it('attaches aggregated turbo_module attributes to the root span', async () => {
    const item = getItemOfTypeFrom<EventItem>(envelope, 'transaction');

    expect(item?.[1]).toEqual(
      expect.objectContaining({
        transaction: TURBO_MODULE_SPAN_NAME,
        contexts: expect.objectContaining({
          trace: expect.objectContaining({
            data: expect.objectContaining({
              'turbo_module.arch': 'new',
              'turbo_module.total_call_count': EXPECTED_CALL_COUNT,
              'turbo_module.total_error_count': 0,
              'turbo_module.total_duration_ms': expect.any(Number),
              'turbo_module.unique_methods': 2,
            }),
          }),
        }),
      }),
    );
  });

  it('attaches a per-module and per-method breakdown', async () => {
    const item = getItemOfTypeFrom<EventItem>(envelope, 'transaction');

    expect(item?.[1]).toEqual(
      expect.objectContaining({
        contexts: expect.objectContaining({
          trace: expect.objectContaining({
            data: expect.objectContaining({
              'turbo_module.NativeSampleModule.add.call_count': 5,
              'turbo_module.NativeSampleModule.add.error_count': 0,
              'turbo_module.NativeSampleModule.add.duration_ms':
                expect.any(Number),
              'turbo_module.NativePlatformSampleModule.getPlatform.call_count': 1,
              'turbo_module.NativePlatformSampleModule.getPlatform.error_count': 0,
              'turbo_module.NativePlatformSampleModule.getPlatform.duration_ms':
                expect.any(Number),
            }),
          }),
        }),
      }),
    );
  });
});
