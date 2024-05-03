import { getActiveSpan, getRootSpan, SentrySpan, spanToJSON } from '@sentry/core';
import type { Span } from '@sentry/types';

/**
 *
 */
export function isCurrentlyActiveSpan(span: Span): boolean {
  const spanId = spanToJSON(span).span_id;
  const activeSpan = getActiveSpan();
  const activeSpanId = activeSpan ? spanToJSON(activeSpan).span_id : undefined;
  return span === getActiveSpan();
}

/**
 *
 */
export function isSentrySpan(span: Span): span is SentrySpan {
  return span instanceof SentrySpan;
}

/**
 *
 */
export function isRootSpan(span: Span): boolean {
  return span === getRootSpan(span);
}
