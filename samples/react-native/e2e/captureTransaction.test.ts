import { describe, it, beforeAll, expect, afterAll } from '@jest/globals';
import { Envelope, EventItem } from '@sentry/core';
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

  let envelope: Envelope;

  beforeAll(async () => {
    await device.launchApp();

    const waitForPerformanceTransaction = sentryServer.waitForEnvelope(
      containingTransactionWithName('Performance'),
    );

    await sleep(1_000);
    await tap('Performance'); // Bottom tab
    await sleep(1_000);

    await waitForPerformanceTransaction;

    envelope = sentryServer.getEnvelope(
      containingTransactionWithName('Errors'), // Sample App Initial Screen
    );
  });

  afterAll(async () => {
    await sentryServer.close();
  });

  it('envelope contains transaction context', async () => {
    const item = getItemOfTypeFrom<EventItem>(envelope, 'transaction');

    expect(item).toEqual([
      expect.objectContaining({
        length: expect.any(Number),
        type: 'transaction',
      }),
      expect.objectContaining({
        platform: 'javascript',
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
});
