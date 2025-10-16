import { describe, it, beforeAll, expect, afterAll } from '@jest/globals';
import { Envelope, EventItem } from '@sentry/core';
import {
  createSentryServer,
  containingTransactionWithName,
  takeSecond,
  containingTransaction,
} from './utils/mockedSentryServer';

import { getItemOfTypeFrom } from './utils/event';
import { maestro } from './utils/maestro';

describe('Capture Spaceflight News Screen Transaction', () => {
  let sentryServer = createSentryServer();

  let newsEnvelopes: Envelope[] = [];
  let allTransactionEnvelopes: Envelope[] = [];

  const getFirstNewsEventItem = () =>
    getItemOfTypeFrom<EventItem>(newsEnvelopes[0], 'transaction');

  const getSecondNewsEventItem = () =>
    getItemOfTypeFrom<EventItem>(newsEnvelopes[1], 'transaction');

  beforeAll(async () => {
    await sentryServer.start();

    const containingNewsScreen = containingTransactionWithName(
      'SpaceflightNewsScreen',
    );
    const waitForSpaceflightNewsTx = sentryServer.waitForEnvelope(
      takeSecond(containingNewsScreen),
    );

    await maestro('captureSpaceflightNewsScreenTransaction.test.yml');

    await waitForSpaceflightNewsTx;

    newsEnvelopes = sentryServer.getAllEnvelopes(containingNewsScreen);
    allTransactionEnvelopes = sentryServer.getAllEnvelopes(
      containingTransaction,
    );
  });

  afterAll(async () => {
    await sentryServer.close();
  });

  it('first received new screen transaction was created before the second visit', async () => {
    const first = getFirstNewsEventItem();
    const second = getSecondNewsEventItem();

    expect(first?.[1].timestamp).toBeDefined();
    expect(second?.[1].timestamp).toBeDefined();
    expect(first![1].timestamp!).toBeLessThan(second![1].timestamp!);
  });

  it('all transaction envelopes have time to display measurements', async () => {
    allTransactionEnvelopes.forEach(envelope => {
      expectToContainTimeToDisplayMeasurements(
        getItemOfTypeFrom<EventItem>(envelope, 'transaction'),
      );
    });
  });

  function expectToContainTimeToDisplayMeasurements(
    item: EventItem | undefined,
  ) {
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
  }

  it('contains at least one xhr breadcrumb of request to the news endpoint', async () => {
    const item = getFirstNewsEventItem();

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
              url: expect.stringContaining(
                'api.spaceflightnewsapi.net/v4/articles',
              ),
            },
            level: 'info',
            timestamp: expect.any(Number),
            type: 'http',
          }),
        ]),
      }),
    );
  });

  it('contains exactly two articles requests spans', () => {
    // This test ensures we are to tracing requests multiple times on different layers
    // fetch > xhr > native

    const item = getFirstNewsEventItem();
    const spans = item?.[1].spans;

    console.log(spans);

    const httpSpans = spans?.filter(
      span => span.data?.['sentry.op'] === 'http.client',
    );
    expect(httpSpans).toHaveLength(2);
  });
});
