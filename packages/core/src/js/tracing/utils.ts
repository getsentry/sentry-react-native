import type { MeasurementUnit, Span, SpanJSON, StartSpanOptions, TransactionSource } from '@sentry/core';

import {
  debug,
  dropUndefinedKeys,
  getSpanDescendants,
  SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_UNIT,
  SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_VALUE,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  setMeasurement,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  spanToJSON,
  startInactiveSpan,
  timestampInSeconds,
  uuid4,
} from '@sentry/core';

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
export function setSpanDurationAsMeasurementOnSpan(name: string, span: Span, on: Span): void {
  const { timestamp: spanEnd, start_timestamp: spanStart } = spanToJSON(span);
  if (!spanEnd || !spanStart) {
    return;
  }

  setSpanMeasurement(on, name, (spanEnd - spanStart) * 1000, 'millisecond');
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
    debug.warn('Missing the bundle start time on the global object.');
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

/**
 * Creates valid span JSON object from the given data.
 */
export function createSpanJSON(
  from: Partial<SpanJSON> & Pick<Required<SpanJSON>, 'description' | 'start_timestamp' | 'timestamp' | 'origin'>,
): SpanJSON {
  return dropUndefinedKeys({
    status: 'ok',
    ...from,
    span_id: from.span_id ? from.span_id : uuid4().substring(16),
    trace_id: from.trace_id ? from.trace_id : uuid4(),
    data: dropUndefinedKeys({
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: from.op,
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: from.origin,
      ...(from.data ? from.data : {}),
    }),
  });
}

/**
 * Wraps a function call that returns a `Promise` with an inactive span that
 * is automatically ended on success or failure (both sync throws and async
 * rejections).
 *
 * This is the standard pattern for instrumenting async SDK operations such as
 * `Image.loadAsync` and `Asset.loadAsync`.
 *
 * The span status is always set by this utility (`ok` on resolve, `error` on
 * reject or sync throw). If you need custom status logic (e.g. inspecting the
 * resolved value), handle span lifecycle manually instead.
 *
 * @param spanOptions  Options forwarded to `startInactiveSpan`.
 * @param fn           The function to call.
 * @returns            Whatever `fn` returns (the original `Promise`).
 */
export function traceAsyncOperation<T>(spanOptions: StartSpanOptions, fn: () => Promise<T>): Promise<T> {
  const span = startInactiveSpan(spanOptions);

  try {
    return fn()
      .then(result => {
        span?.setStatus({ code: SPAN_STATUS_OK });
        span?.end();
        return result;
      })
      .catch((error: unknown) => {
        span?.setStatus({ code: SPAN_STATUS_ERROR, message: String(error) });
        span?.end();
        throw error;
      });
  } catch (error) {
    span?.setStatus({ code: SPAN_STATUS_ERROR, message: String(error) });
    span?.end();
    throw error;
  }
}

/**
 * Strips query string and fragment from a URL, preserving the scheme, host, and path.
 */
export function sanitizeUrl(url: string): string {
  try {
    const withoutQuery = url.split('?')[0] || url;
    return withoutQuery.split('#')[0] || withoutQuery;
  } catch {
    return url;
  }
}

/**
 * Extracts a short, human-readable description from a URL by stripping
 * the query string, fragment, and path — returning only the filename.
 */
export function describeUrl(url: string): string {
  try {
    // Remove query string and fragment
    const withoutQuery = url.split('?')[0] || url;
    const withoutFragment = withoutQuery.split('#')[0] || withoutQuery;
    const filename = withoutFragment.split('/').pop();
    return filename || withoutFragment;
  } catch {
    return url;
  }
}

const SENTRY_DEFAULT_ORIGIN = 'manual';

/**
 *
 */
export function createChildSpanJSON(
  parent: SpanJSON,
  from: Partial<SpanJSON> & Pick<Required<SpanJSON>, 'description' | 'start_timestamp' | 'timestamp'>,
): SpanJSON {
  return createSpanJSON({
    op: parent.op,
    trace_id: parent.trace_id,
    parent_span_id: parent.span_id,
    origin: parent.origin || SENTRY_DEFAULT_ORIGIN,
    ...from,
  });
}
