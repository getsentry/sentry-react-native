import { describe, it, beforeAll, expect, afterAll } from '@jest/globals';
import { EventItem } from '@sentry/core';
import {
  createSentryServer,
  containingTransactionWithName,
} from './utils/mockedSentryServer';

import { getItemOfTypeFrom } from './utils/event';
import { maestro } from './utils/maestro';

describe('Capture Errors Screen Transaction', () => {
  let sentryServer = createSentryServer();

  const getErrorsEnvelope = () =>
    sentryServer.getEnvelope(containingTransactionWithName('Errors'));

  beforeAll(async () => {
    await sentryServer.start();

    const waitForErrorsTx = sentryServer.waitForEnvelope(
      containingTransactionWithName('Errors'), // The last created and sent transaction
    );

    await maestro('captureErrorsScreenTransaction.test.yml');

    await waitForErrorsTx;
  });

  afterAll(async () => {
    await sentryServer.close();
  });

  it('envelope contains transaction context', async () => {
    const item = getItemOfTypeFrom<EventItem>(
      getErrorsEnvelope(),
      'transaction',
    );

    expect(item).toEqual([
      expect.objectContaining({
        length: expect.any(Number),
        type: 'transaction',
      }),
      expect.objectContaining({
        platform: 'javascript',
        transaction: 'ErrorsScreen',
        contexts: expect.objectContaining({
          trace: {
            data: {
              'route.has_been_seen': false,
              'route.key': expect.stringMatching(/^ErrorsScreen/),
              'route.name': 'ErrorsScreen',
              'sentry.idle_span_finish_reason': 'idleTimeout',
              'sentry.op': 'ui.load',
              'sentry.origin': 'auto.app.start',
              'sentry.sample_rate': 1,
              'sentry.source': 'component',
              'thread.name': 'javascript',
            },
            op: 'ui.load',
            origin: 'auto.app.start',
            span_id: expect.any(String),
            trace_id: expect.any(String),
          },
        }),
      }),
    ]);
  });

  it('contains app start measurements', async () => {
    const item = getItemOfTypeFrom<EventItem>(
      getErrorsEnvelope(),
      'transaction',
    );

    expect(item?.[1]).toEqual(
      expect.objectContaining({
        measurements: expect.objectContaining({
          time_to_initial_display: {
            unit: 'millisecond',
            value: expect.any(Number),
          },
          app_start_cold: {
            unit: 'millisecond',
            value: expect.any(Number),
          },
        }),
      }),
    );
  });

  it('contains time to initial display measurements', async () => {
    const item = getItemOfTypeFrom<EventItem>(
      await getErrorsEnvelope(),
      'transaction',
    );

    expect(item?.[1]).toEqual(
      expect.objectContaining({
        measurements: expect.objectContaining({
          time_to_initial_display: {
            unit: 'millisecond',
            value: expect.any(Number),
          },
        }),
      }),
    );
  });

  it('contains JS stall measurements', async () => {
    const item = getItemOfTypeFrom<EventItem>(
      await getErrorsEnvelope(),
      'transaction',
    );

    expect(item?.[1]).toEqual(
      expect.objectContaining({
        measurements: expect.objectContaining({
          stall_count: {
            unit: 'none',
            value: expect.any(Number),
          },
          stall_longest_time: {
            unit: 'millisecond',
            value: expect.any(Number),
          },
          stall_total_time: {
            unit: 'millisecond',
            value: expect.any(Number),
          },
        }),
      }),
    );
  });
});
