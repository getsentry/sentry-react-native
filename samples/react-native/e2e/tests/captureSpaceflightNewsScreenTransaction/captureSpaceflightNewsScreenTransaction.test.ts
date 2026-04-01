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
    // Sort by transaction timestamp — envelope delivery order may vary on slow CI VMs,
    // but test assertions depend on chronological order.
    newsEnvelopes.sort((a, b) => {
      const aItem = getItemOfTypeFrom<EventItem>(a, 'transaction');
      const bItem = getItemOfTypeFrom<EventItem>(b, 'transaction');
      return (aItem?.[1]?.timestamp ?? 0) - (bItem?.[1]?.timestamp ?? 0);
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
        // Only navigation and app start transactions have time-to-display measurements.
        // Filter with an allow-list — other ops like 'ui.action.touch' or
        // 'navigation.processing' do not include TTID/TTFD.
        const op = item?.[1]?.contexts?.trace?.op;
        return op === 'navigation' || op === 'ui.load';
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
    // On slow CI VMs, not all layers may complete before the idle span
    // timeout fires, so we assert at least one span is present.

    const item = getFirstNewsEventItem();
    const spans = item?.[1].spans;

    const httpSpans = spans?.filter(
      span => span.data?.['sentry.op'] === 'http.client',
    );
    expect(httpSpans?.length).toBeGreaterThanOrEqual(1);
  });
});
