import {
  getSpanDescendants,
  SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_UNIT,
  SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_VALUE,
  setMeasurement,
  spanToJSON,
} from '@sentry/core';
import type { MeasurementUnit, Span, TransactionSource } from '@sentry/types';
import { logger, timestampInSeconds } from '@sentry/utils';

import { RN_GLOBAL_OBJ } from '../utils/worldwide';

export const defaultTransactionSource: TransactionSource = 'component';
export const customTransactionSource: TransactionSource = 'custom';

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

/**
 * Returns the latest end timestamp of the child spans of the given span.
 */
export function getLatestChildSpanEndTimestamp(span: Span): number | undefined {
  const childEndTimestamps = getSpanDescendants(span)
    .map(span => spanToJSON(span).timestamp)
    .filter(timestamp => !!timestamp) as number[];

  return childEndTimestamps.length ? Math.max(...childEndTimestamps) : undefined;
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
