import type { Client, Span } from '@sentry/core';
import { getSpanDescendants, logger, SPAN_STATUS_ERROR, spanToJSON } from '@sentry/core';
import type { AppStateStatus } from 'react-native';
import { AppState } from 'react-native';

import { isRootSpan, isSentrySpan } from '../utils/span';

/**
 * Hooks on span end event to execute a callback when the span ends.
 */
export function onThisSpanEnd(client: Client, span: Span, callback: (span: Span) => void): void {
  client.on('spanEnd', (endedSpan: Span) => {
    if (span !== endedSpan) {
      return;
    }
    callback(endedSpan);
  });
}

export const adjustTransactionDuration = (client: Client, span: Span, maxDurationMs: number): void => {
  if (!isRootSpan(span)) {
    logger.warn('Not sampling empty back spans only works for Sentry Transactions (Root Spans).');
    return;
  }

  client.on('spanEnd', (endedSpan: Span) => {
    if (endedSpan !== span) {
      return;
    }

    const endTimestamp = spanToJSON(span).timestamp;
    const startTimestamp = spanToJSON(span).start_timestamp;
    if (!endTimestamp || !startTimestamp) {
      return;
    }

    const diff = endTimestamp - startTimestamp;
    const isOutdatedTransaction = endTimestamp && (diff > maxDurationMs || diff < 0);
    if (isOutdatedTransaction) {
      span.setStatus({ code: SPAN_STATUS_ERROR, message: 'deadline_exceeded' });
      // TODO: check where was used, might be possible to delete
      span.setAttribute('maxTransactionDurationExceeded', 'true');
    }
  });
};

export const ignoreEmptyBackNavigation = (client: Client | undefined, span: Span): void => {
  if (!client) {
    logger.warn('Could not hook on spanEnd event because client is not defined.');
    return;
  }

  if (!span) {
    logger.warn('Could not hook on spanEnd event because span is not defined.');
    return;
  }

  if (!isRootSpan(span) || !isSentrySpan(span)) {
    logger.warn('Not sampling empty back spans only works for Sentry Transactions (Root Spans).');
    return;
  }

  client.on('spanEnd', (endedSpan: Span) => {
    if (endedSpan !== span) {
      return;
    }

    if (!spanToJSON(span).data?.['route.has_been_seen']) {
      return;
    }

    const children = getSpanDescendants(span);
    const filtered = children.filter(
      child =>
        child.spanContext().spanId !== span.spanContext().spanId &&
        spanToJSON(child).op !== 'ui.load.initial_display' &&
        spanToJSON(child).op !== 'navigation.processing',
    );

    if (filtered.length <= 0) {
      // filter children must include at least one span not created by the navigation automatic instrumentation
      logger.log(
        'Not sampling transaction as route has been seen before. Pass ignoreEmptyBackNavigationTransactions = false to disable this feature.',
      );
      // Route has been seen before and has no child spans.
      span['_sampled'] = false;
    }
  });
};

/**
 * Idle Transaction callback to only sample transactions with child spans.
 * To avoid side effects of other callbacks this should be hooked as the last callback.
 */
export const onlySampleIfChildSpans = (client: Client, span: Span): void => {
  if (!isRootSpan(span) || !isSentrySpan(span)) {
    logger.warn('Not sampling childless spans only works for Sentry Transactions (Root Spans).');
    return;
  }

  client.on('spanEnd', (endedSpan: Span) => {
    if (endedSpan !== span) {
      return;
    }

    const children = getSpanDescendants(span);

    if (children.length <= 1) {
      // Span always has at lest one child, itself
      logger.log(`Not sampling as ${spanToJSON(span).op} transaction has no child spans.`);
      span['_sampled'] = false;
    }
  });
};

/**
 * Hooks on AppState change to cancel the span if the app goes background.
 */
export const cancelInBackground = (client: Client, span: Span): void => {
  const subscription = AppState.addEventListener('change', (newState: AppStateStatus) => {
    if (newState === 'background') {
      logger.debug(`Setting ${spanToJSON(span).op} transaction to cancelled because the app is in the background.`);
      span.setStatus({ code: SPAN_STATUS_ERROR, message: 'cancelled' });
      span.end();
    }
  });

  subscription &&
    client.on('spanEnd', (endedSpan: Span) => {
      if (endedSpan === span) {
        logger.debug(`Removing AppState listener for ${spanToJSON(span).op} transaction.`);
        subscription && subscription.remove && subscription.remove();
      }
    });
};
