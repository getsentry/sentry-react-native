import { describe, it, beforeAll, expect, afterAll } from '@jest/globals';
import { EventItem } from '@sentry/core';
import { device } from 'detox';
import {
  createSentryServer,
  containingTransactionWithName,
} from './utils/mockedSentryServer';
import { tap } from './utils/tap';
import { sleep } from './utils/sleep';
import { getItemOfTypeFrom } from './utils/event';

describe('Capture transaction', () => {
  let sentryServer = createSentryServer();
  sentryServer.start();

  const getErrorsEnvelope = () =>
    sentryServer.getEnvelope(containingTransactionWithName('Errors'));

  const getTrackerEnvelope = () =>
    sentryServer.getEnvelope(containingTransactionWithName('Tracker'));

  beforeAll(async () => {
    await device.launchApp();

    const waitForPerformanceTransaction = sentryServer.waitForEnvelope(
      containingTransactionWithName('Tracker'), // The last created and sent transaction
    );

    await sleep(500);
    await tap('Performance'); // Bottom tab
    await sleep(200);
    await tap('Auto Tracing Example'); // Screen with Full Display

    await waitForPerformanceTransaction;
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

    expect(
      item?.[1].measurements?.app_start_warm ||
        item?.[1].measurements?.app_start_cold,
    ).toBeDefined();
    expect(item?.[1]).toEqual(
      expect.objectContaining({
        measurements: expect.objectContaining({
          time_to_initial_display: {
            unit: 'millisecond',
            value: expect.any(Number),
          },
          // Expect warm or cold app start measurements
          ...(item?.[1].measurements?.app_start_warm && {
            app_start_warm: {
              unit: 'millisecond',
              value: expect.any(Number),
            },
          }),
          ...(item?.[1].measurements?.app_start_cold && {
            app_start_cold: {
              unit: 'millisecond',
              value: expect.any(Number),
            },
          }),
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

  it('contains time to display measurements', async () => {
    const item = getItemOfTypeFrom<EventItem>(
      getTrackerEnvelope(),
      'transaction',
    );

    expect(item?.[1]).toEqual(
      expect.objectContaining({
        measurements: expect.objectContaining({
          time_to_initial_display: {
            unit: 'millisecond',
            value: expect.any(Number),
          },
          time_to_full_display: {
            unit: 'millisecond',
            value: expect.any(Number),
          },
        }),
      }),
    );
  });

  it('contains at least one xhr breadcrumb of request to the tracker endpoint', async () => {
    const item = getItemOfTypeFrom<EventItem>(
      getTrackerEnvelope(),
      'transaction',
    );

    expect(item?.[1]).toEqual(
      expect.objectContaining({
        breadcrumbs: expect.arrayContaining([
          expect.objectContaining({
            category: 'xhr',
            data: {
              end_timestamp: expect.any(Number),
              method: 'GET',
              response_body_size: expect.any(Number),
              start_timestamp: expect.any(Number),
              status_code: expect.any(Number),
              url: expect.stringContaining('api.covid19api.com/summary'),
            },
            level: 'info',
            timestamp: expect.any(Number),
            type: 'http',
          }),
        ]),
      }),
    );
  });
});
