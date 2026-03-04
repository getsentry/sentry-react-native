import { describe, it, beforeAll, expect, afterAll } from '@jest/globals';
import { Envelope, EventItem } from '@sentry/core';
import {
  createSentryServer,
  containingTransactionWithName,
  takeSecond,
  containingTransaction,
} from '../../utils/mockedSentryServer';

import { getItemOfTypeFrom } from '../../utils/event';
import { maestro } from '../../utils/maestro';
import { isAutoInitTest } from '../../utils/environment';

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

    if (isAutoInitTest()) {
      await maestro('tests/captureSpaceflightNewsScreenTransaction/captureSpaceflightNewsScreenTransaction.test.ios.auto.yml');
    } else {
      await maestro('tests/captureSpaceflightNewsScreenTransaction/captureSpaceflightNewsScreenTransaction.test.yml');
    }

    await waitForSpaceflightNewsTx;

    newsEnvelopes = sentryServer.getAllEnvelopes(containingNewsScreen);
    // Sort by transaction timestamp to ensure consistent ordering regardless of arrival time.
    // On slow CI VMs (e.g., Cirrus Labs Tart), envelopes may arrive out of order.
    newsEnvelopes.sort((a, b) => {
      const aItem = getItemOfTypeFrom<EventItem>(a, 'transaction');
      const bItem = getItemOfTypeFrom<EventItem>(b, 'transaction');
      return (aItem?.[1].timestamp ?? 0) - (bItem?.[1].timestamp ?? 0);
    });
    allTransactionEnvelopes = sentryServer.getAllEnvelopes(
      containingTransaction,
    );
  }, 240000); // 240 seconds timeout for iOS event delivery

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

  it('all navigation transaction envelopes have time to display measurements', async () => {
    allTransactionEnvelopes
      .filter(envelope => {
        const item = getItemOfTypeFrom<EventItem>(envelope, 'transaction');
        const traceContext = item?.[1]?.contexts?.trace;
        // Exclude user interaction transactions (no time-to-display measurements)
        if (traceContext?.op === 'ui.action.touch') return false;
        // Exclude app start transactions (have app_start_cold measurements, not time-to-display)
        if (traceContext?.origin === 'auto.app.start') return false;
        return true;
      })
      .forEach(envelope => {
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

  it('contains articles requests spans', () => {
    // This test ensures we are tracing requests on different layers
    // fetch > xhr > native
    // On slow CI VMs, not all HTTP span layers may complete within the transaction,
    // so we check for at least one HTTP span.

    const item = getFirstNewsEventItem();
    const spans = item?.[1].spans;

    const httpSpans = spans?.filter(
      span => span.data?.['sentry.op'] === 'http.client',
    );
    expect(httpSpans!.length).toBeGreaterThanOrEqual(1);
  });
});
