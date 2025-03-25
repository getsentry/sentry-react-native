import { describe, it, beforeAll, expect, afterAll } from '@jest/globals';
import { Envelope, EventItem } from '@sentry/core';
import {
  createSentryServer,
  containingTransactionWithName,
  takeSecond,
} from './utils/mockedSentryServer';

import { getItemOfTypeFrom } from './utils/event';
import { maestro } from './utils/maestro';

describe('Capture Spaceflight News Screen Transaction', () => {
  let sentryServer = createSentryServer();
  sentryServer.start();

  let envelopes: Envelope[] = [];

  const getFirstTransactionEnvelopeItem = () =>
    getItemOfTypeFrom<EventItem>(envelopes[0], 'transaction');

  const getSecondTransactionEnvelopeItem = () =>
    getItemOfTypeFrom<EventItem>(envelopes[1], 'transaction');

  beforeAll(async () => {
    const containingNewsScreen = containingTransactionWithName(
      'SpaceflightNewsScreen',
    );
    const waitForSpaceflightNewsTx = sentryServer.waitForEnvelope(
      takeSecond(containingNewsScreen),
    );

    await maestro('captureSpaceflightNewsScreenTransaction.test.yml');

    await waitForSpaceflightNewsTx;

    envelopes = sentryServer.getAllEnvelopes(containingNewsScreen);
  });

  afterAll(async () => {
    await sentryServer.close();
  });

  it('first received new screen transaction was created before the second visit', async () => {
    const first = getFirstTransactionEnvelopeItem();
    const second = getSecondTransactionEnvelopeItem();

    expect(first?.[1].timestamp).toBeDefined();
    expect(second?.[1].timestamp).toBeDefined();
    expect(first![1].timestamp!).toBeLessThan(second![1].timestamp!);
  });

  it('contains time to display measurements on the first visit', async () => {
    expectToContainTimeToDisplayMeasurements(getFirstTransactionEnvelopeItem());
  });

  it('contains time to display measurements on the second visit', async () => {
    expectToContainTimeToDisplayMeasurements(
      getSecondTransactionEnvelopeItem(),
    );
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
    const item = getFirstTransactionEnvelopeItem();

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
});
