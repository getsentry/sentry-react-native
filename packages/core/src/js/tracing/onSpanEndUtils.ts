import type { Client, Span } from '@sentry/core';
import { debug, getSpanDescendants, SPAN_STATUS_ERROR, spanToJSON } from '@sentry/core';
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
    debug.warn('Not sampling empty back spans only works for Sentry Transactions (Root Spans).');
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

export const ignoreEmptyBackNavigation = (client: Client | undefined, span: Span | undefined): void => {
  if (!client) {
    debug.warn('Could not hook on spanEnd event because client is not defined.');
    return;
  }

  if (!span) {
    debug.warn('Could not hook on spanEnd event because span is not defined.');
    return;
  }

  if (!isRootSpan(span) || !isSentrySpan(span)) {
    debug.warn('Not sampling empty back spans only works for Sentry Transactions (Root Spans).');
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
      debug.log(
        'Not sampling transaction as route has been seen before. Pass ignoreEmptyBackNavigationTransactions = false to disable this feature.',
      );
      // Route has been seen before and has no child spans.
      span['_sampled'] = false;
    }
  });
};

/**
 * Discards empty "Route Change" transactions that never received route information.
 * This happens when navigation library emits a route change event but getCurrentRoute() returns undefined.
 * Such transactions don't contain any useful information and should not be sent to Sentry.
 *
 * This function must be called with a reference tracker function that can check if the span
 * was cleared from the integration's tracking (indicating it went through the state listener).
 */
export const ignoreEmptyRouteChangeTransactions = (
  client: Client | undefined,
  span: Span | undefined,
  defaultNavigationSpanName: string,
  isSpanStillTracked: () => boolean,
): void => {
  if (!client) {
    debug.warn('Could not hook on spanEnd event because client is not defined.');
    return;
  }

  if (!span) {
    debug.warn('Could not hook on spanEnd event because span is not defined.');
    return;
  }

  if (!isRootSpan(span) || !isSentrySpan(span)) {
    debug.warn('Not sampling empty route change transactions only works for Sentry Transactions (Root Spans).');
    return;
  }

  client.on('spanEnd', (endedSpan: Span) => {
    if (endedSpan !== span) {
      return;
    }

    const spanJSON = spanToJSON(span);

    // Only check spans that still have the default navigation name
    if (spanJSON.description !== defaultNavigationSpanName) {
      return;
    }

    // If the span has route information, it went through the normal flow
    if (spanJSON.data?.['route.name']) {
      return;
    }

    // If the span was cleared from tracking, it means the state listener was called
    // (even if for same-route navigation), so we should allow it through
    if (!isSpanStillTracked()) {
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
      // No meaningful child spans and still has default name - this is an empty Route Change transaction
      debug.log(`Discarding empty "${defaultNavigationSpanName}" transaction that never received route information.`);
      span['_sampled'] = false;

      // Record as dropped transaction for observability
      client.recordDroppedEvent('sample_rate', 'transaction');
    }
  });
};

/**
 * Idle Transaction callback to only sample transactions with child spans.
 * To avoid side effects of other callbacks this should be hooked as the last callback.
 */
export const onlySampleIfChildSpans = (client: Client, span: Span): void => {
  if (!isRootSpan(span) || !isSentrySpan(span)) {
    debug.warn('Not sampling childless spans only works for Sentry Transactions (Root Spans).');
    return;
  }

  client.on('spanEnd', (endedSpan: Span) => {
    if (endedSpan !== span) {
      return;
    }

    const children = getSpanDescendants(span);

    if (children.length <= 1) {
      // Span always has at lest one child, itself
      debug.log(`Not sampling as ${spanToJSON(span).op} transaction has no child spans.`);
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
      debug.log(`Setting ${spanToJSON(span).op} transaction to cancelled because the app is in the background.`);
      span.setStatus({ code: SPAN_STATUS_ERROR, message: 'cancelled' });
      span.end();
    }
  });

  subscription &&
    client.on('spanEnd', (endedSpan: Span) => {
      if (endedSpan === span) {
        debug.log(`Removing AppState listener for ${spanToJSON(span).op} transaction.`);
        subscription?.remove?.();
      }
    });
};
