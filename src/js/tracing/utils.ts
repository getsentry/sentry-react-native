import {
  SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_UNIT,
  SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_VALUE,
  setMeasurement,
  spanToJSON,
} from '@sentry/core';
import type { MeasurementUnit, Span, TransactionSource } from '@sentry/types';
import { timestampInSeconds } from '@sentry/utils';

export const defaultTransactionSource: TransactionSource = 'component';
export const customTransactionSource: TransactionSource = 'custom';

// TODO: check were these values should move
// export const getBlankTransactionContext = (_name: string): TransactionContext => {
//   return {
//     name: 'Route Change',
//     op: 'navigation',
//     tags: {
//       'routing.instrumentation': name,
//     },
//     data: {},
//     metadata: {
//       source: defaultTransactionSource,
//     },
//   };
// };

/**
 * A margin of error of 50ms is allowed for the async native bridge call.
 * Anything larger would reduce the accuracy of our frames measurements.
 */
export const MARGIN_OF_ERROR_SECONDS = 0.05;

const timeOriginMilliseconds = Date.now();

/**
 * Returns the timestamp where the JS global scope was initialized.
 */
export function getTimeOriginMilliseconds(): number {
  return timeOriginMilliseconds;
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

/**
 * Sets measurement on the give span.
 */
export function setSpanMeasurement(span: Span, key: string, value: number, unit: MeasurementUnit): void {
  span.addEvent(key, {
    [SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_VALUE]: value,
    [SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_UNIT]: unit as string,
  });
}
