import {
  type IdleTransaction,
  type Span as SpanClass,
  type Transaction,
  setMeasurement,
  spanToJSON,
} from '@sentry/core';
import type { Span, TransactionContext, TransactionSource } from '@sentry/types';
import { timestampInSeconds } from '@sentry/utils';

export const defaultTransactionSource: TransactionSource = 'component';
export const customTransactionSource: TransactionSource = 'custom';

export const getBlankTransactionContext = (name: string): TransactionContext => {
  return {
    name: 'Route Change',
    op: 'navigation',
    tags: {
      'routing.instrumentation': name,
    },
    data: {},
    metadata: {
      source: defaultTransactionSource,
    },
  };
};

/**
 * A margin of error of 50ms is allowed for the async native bridge call.
 * Anything larger would reduce the accuracy of our frames measurements.
 */
export const MARGIN_OF_ERROR_SECONDS = 0.05;

const timeOriginMilliseconds = Date.now();

/**
 *
 */
export function adjustTransactionDuration(
  maxDurationMs: number,
  transaction: IdleTransaction,
  endTimestamp: number,
): void {
  const diff = endTimestamp - transaction.startTimestamp;
  const isOutdatedTransaction = endTimestamp && (diff > maxDurationMs || diff < 0);
  if (isOutdatedTransaction) {
    transaction.setStatus('deadline_exceeded');
    transaction.setTag('maxTransactionDurationExceeded', 'true');
  }
}

/**
 * Returns the timestamp where the JS global scope was initialized.
 */
export function getTimeOriginMilliseconds(): number {
  return timeOriginMilliseconds;
}

/**
 * Calls the callback every time a child span of the transaction is finished.
 */
export function instrumentChildSpanFinish(
  transaction: Transaction,
  callback: (span: SpanClass, endTimestamp?: number) => void,
): void {
  if (transaction.spanRecorder) {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalAdd = transaction.spanRecorder.add;

    transaction.spanRecorder.add = (span: SpanClass): void => {
      originalAdd.apply(transaction.spanRecorder, [span]);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      const originalSpanFinish = span.finish;

      span.finish = (endTimestamp?: number) => {
        originalSpanFinish.apply(span, [endTimestamp]);

        callback(span, endTimestamp);
      };

      // eslint-disable-next-line @typescript-eslint/unbound-method
      const originalSpanEnd = span.end;

      span.end = (endTimestamp?: number) => {
        originalSpanEnd.apply(span, [endTimestamp]);

        callback(span, endTimestamp);
      };
    };
  }
}

/**
 * Determines if the timestamp is now or within the specified margin of error from now.
 */
export function isNearToNow(timestamp: number | undefined): boolean {
  if (!timestamp) {
    return false;
  }
  return Math.abs(timestampInSeconds() - timestamp) <= MARGIN_OF_ERROR_SECONDS;
}

/**
 * Sets the duration of the span as a measurement.
 * Uses `setMeasurement` function from @sentry/core.
 */
export function setSpanDurationAsMeasurement(name: string, span: Span): void {
  const spanEnd = spanToJSON(span).timestamp;
  const spanStart = spanToJSON(span).start_timestamp;
  if (!spanEnd || !spanStart) {
    return;
  }

  setMeasurement(name, (spanEnd - spanStart) * 1000, 'millisecond');
}
