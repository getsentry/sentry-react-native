import type { Client, Span } from '@sentry/core';
import type { AppStateStatus } from 'react-native';

import { debug, getSpanDescendants, SPAN_STATUS_ERROR, spanToJSON, timestampInSeconds } from '@sentry/core';
import { AppState, Platform } from 'react-native';

import { isRootSpan, isSentrySpan } from '../utils/span';

/**
 * The time to wait after the app enters the `inactive` state on iOS before
 * cancelling the span.
 */
const IOS_INACTIVE_CANCEL_DELAY_MS = 5_000;

/**
 * Hooks on span end event to execute a callback when the span ends.
 */
export function onThisSpanEnd(client: Client, span: Span, callback: (span: Span) => void): void {
  const unsubscribe = client.on('spanEnd', (endedSpan: Span) => {
    if (span !== endedSpan) {
      return;
    }
    unsubscribe();
    callback(endedSpan);
  });
}

export const adjustTransactionDuration = (client: Client, span: Span, maxDurationMs: number): void => {
  if (!isRootSpan(span)) {
    debug.warn('Not sampling empty back spans only works for Sentry Transactions (Root Spans).');
    return;
  }

  const unsubscribe = client.on('spanEnd', (endedSpan: Span) => {
    if (endedSpan !== span) {
      return;
    }
    unsubscribe();

    const endTimestamp = spanToJSON(span).timestamp;
    const startTimestamp = spanToJSON(span).start_timestamp;
    if (!endTimestamp || !startTimestamp) {
      return;
    }

    const diff = endTimestamp - startTimestamp; // a diff in *seconds*
    const isOutdatedTransaction = diff > maxDurationMs / 1000 || diff < 0;

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

  const unsubscribe = client.on('spanEnd', (endedSpan: Span) => {
    if (endedSpan !== span) {
      return;
    }
    unsubscribe();

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

  const unsubscribe = client.on('spanEnd', (endedSpan: Span) => {
    if (endedSpan !== span) {
      return;
    }
    unsubscribe();

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
 *
 * On iOS the JS thread can be suspended between the `inactive` and
 * `background` transitions, which means the `background` event may never
 * reach JS in time. To handle this we schedule a deferred cancellation when
 * the app becomes `inactive`. If the app returns to `active` before the
 * timeout fires, the cancellation is cleared. If it transitions to
 * `background` first, we cancel immediately and clear the timeout.
 */
export const cancelInBackground = (client: Client, span: Span): void => {
  let inactiveTimeout: ReturnType<typeof setTimeout> | undefined;

  // The timestamp when the app actually left the foreground. Used to end
  // http.client child spans at the right time instead of whenever the
  // deferred cancellation timer fires (which can be much later if the JS
  // thread was suspended on iOS).
  let leftForegroundTimestamp: number | undefined;

  const cancelSpan = (): void => {
    if (inactiveTimeout !== undefined) {
      clearTimeout(inactiveTimeout);
      inactiveTimeout = undefined;
    }
    debug.log(`Setting ${spanToJSON(span).op} transaction to cancelled because the app is in the background.`);

    // End still-recording http.client children at the time the app left
    // the foreground, not when the deferred timer fires. On iOS, the JS
    // thread can be suspended after the `inactive` event, so the 5-second
    // timer may fire long after the app backgrounded. Using the original
    // timestamp prevents inflated span durations.
    const childEndTimestamp = leftForegroundTimestamp ?? timestampInSeconds();
    const children = getSpanDescendants(span);
    for (const child of children) {
      if (child !== span && child.isRecording() && spanToJSON(child).op === 'http.client') {
        child.setStatus({ code: SPAN_STATUS_ERROR, message: 'cancelled' });
        child.end(childEndTimestamp);
      }
    }

    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'cancelled' });
    span.end();
  };

  const subscription = AppState.addEventListener('change', (newState: AppStateStatus) => {
    if (newState === 'background') {
      leftForegroundTimestamp = leftForegroundTimestamp ?? timestampInSeconds();
      cancelSpan();
    } else if (Platform.OS === 'ios' && newState === 'inactive') {
      // Record when the app actually left the foreground.
      leftForegroundTimestamp = timestampInSeconds();
      // Schedule a deferred cancellation — if the JS thread is suspended
      // before the 'background' event fires, this timer will execute when
      // the app is eventually resumed and end the span.
      if (inactiveTimeout === undefined) {
        inactiveTimeout = setTimeout(cancelSpan, IOS_INACTIVE_CANCEL_DELAY_MS);
      }
    } else if (newState === 'active') {
      // App returned to foreground — clear any pending inactive cancellation.
      leftForegroundTimestamp = undefined;
      if (inactiveTimeout !== undefined) {
        clearTimeout(inactiveTimeout);
        inactiveTimeout = undefined;
      }
    }
  });

  if (subscription) {
    const unsubscribe = client.on('spanEnd', (endedSpan: Span) => {
      if (endedSpan !== span) {
        return;
      }
      unsubscribe();
      debug.log(`Removing AppState listener for ${spanToJSON(span).op} transaction.`);
      if (inactiveTimeout !== undefined) {
        clearTimeout(inactiveTimeout);
        inactiveTimeout = undefined;
      }
      subscription.remove?.();
    });
  }
};
