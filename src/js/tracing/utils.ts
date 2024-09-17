import type { Transaction } from '@sentry/core';
import { type IdleTransaction, type Span as SpanClass, setMeasurement, spanToJSON } from '@sentry/core';
import type { Span, Transaction as TransactionType, TransactionContext, TransactionSource } from '@sentry/types';
import { logger, timestampInSeconds } from '@sentry/utils';

import { RN_GLOBAL_OBJ } from '../utils/worldwide';

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
export function isNearToNow(timestamp: number): boolean {
  return Math.abs(timestampInSeconds() - timestamp) <= MARGIN_OF_ERROR_SECONDS;
}

/**
 * Sets the duration of the span as a measurement.
 * Uses `setMeasurement` function from @sentry/core.
 */
export function setSpanDurationAsMeasurement(name: string, span: Span): void {
  const { timestamp: spanEnd, start_timestamp: spanStart } = spanToJSON(span);
  if (!spanEnd || !spanStart) {
    return;
  }

  setMeasurement(name, (spanEnd - spanStart) * 1000, 'millisecond');
}

/**
 * Sets the duration of the span as a measurement.
 * Uses `setMeasurement` function from @sentry/core.
 */
export function setSpanDurationAsMeasurementOnTransaction(
  transaction: TransactionType,
  name: string,
  span: Span,
): void {
  const { timestamp: spanEnd, start_timestamp: spanStart } = spanToJSON(span);
  if (!spanEnd || !spanStart) {
    return;
  }

  transaction.setMeasurement(name, (spanEnd - spanStart) * 1000, 'millisecond');
}

/**
 * Returns unix timestamp in ms of the bundle start time.
 *
 * If not available, returns undefined.
 */
export function getBundleStartTimestampMs(): number | undefined {
  const bundleStartTime = RN_GLOBAL_OBJ.__BUNDLE_START_TIME__;
  if (!bundleStartTime) {
    logger.warn('Missing the bundle start time on the global object.');
    return undefined;
  }

  if (!RN_GLOBAL_OBJ.nativePerformanceNow) {
    // bundleStartTime is Date.now() in milliseconds
    return bundleStartTime;
  }

  // nativePerformanceNow() is monotonic clock like performance.now()
  const approxStartingTimeOrigin = Date.now() - RN_GLOBAL_OBJ.nativePerformanceNow();
  return approxStartingTimeOrigin + bundleStartTime;
}
