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

/**
 * Helper function to filter out auto-instrumentation child spans.
 */
function getMeaningfulChildSpans(span: Span): Span[] {
  const children = getSpanDescendants(span);
  return children.filter(
    child =>
      child.spanContext().spanId !== span.spanContext().spanId &&
      spanToJSON(child).op !== 'ui.load.initial_display' &&
      spanToJSON(child).op !== 'navigation.processing',
  );
}

/**
 * Generic helper to discard empty navigation spans based on a condition.
 */
function discardEmptyNavigationSpan(
  client: Client | undefined,
  span: Span | undefined,
  shouldDiscardFn: (span: Span) => boolean,
  onDiscardFn: (span: Span) => void,
): void {
  if (!client) {
    debug.warn('Could not hook on spanEnd event because client is not defined.');
    return;
  }

  if (!span) {
    debug.warn('Could not hook on spanEnd event because span is not defined.');
    return;
  }

  if (!isRootSpan(span) || !isSentrySpan(span)) {
    debug.warn('Not sampling empty navigation spans only works for Sentry Transactions (Root Spans).');
    return;
  }

  client.on('spanEnd', (endedSpan: Span) => {
    if (endedSpan !== span) {
      return;
    }

    if (!shouldDiscardFn(span)) {
      return;
    }

    const meaningfulChildren = getMeaningfulChildSpans(span);
    if (meaningfulChildren.length <= 0) {
      onDiscardFn(span);
      span['_sampled'] = false;
    }
  });
}

export const ignoreEmptyBackNavigation = (client: Client | undefined, span: Span | undefined): void => {
  discardEmptyNavigationSpan(
    client,
    span,
    // Only discard if route has been seen before
    span => spanToJSON(span).data?.['route.has_been_seen'] === true,
    // Log message when discarding
    () => {
      debug.log(
        'Not sampling transaction as route has been seen before. Pass ignoreEmptyBackNavigationTransactions = false to disable this feature.',
      );
    },
  );
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
  discardEmptyNavigationSpan(
    client,
    span,
    // Only discard if:
    // 1. Still has default name
    // 2. No route information was set
    // 3. Still being tracked (state listener never called)
    span => {
      const spanJSON = spanToJSON(span);
      return (
        spanJSON.description === defaultNavigationSpanName && !spanJSON.data?.['route.name'] && isSpanStillTracked()
      );
    },
    // Log and record dropped event
    _span => {
      debug.log(`Discarding empty "${defaultNavigationSpanName}" transaction that never received route information.`);
      client?.recordDroppedEvent('sample_rate', 'transaction');
    },
  );
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
