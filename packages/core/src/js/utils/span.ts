import type { Span, TransactionEvent } from '@sentry/core';
import { getRootSpan, SentrySpan } from '@sentry/core';

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

const END_TIME_SCOPE_FIELD = '_endTime';
const CONVERT_SPAN_TO_TRANSACTION_FIELD = '_convertSpanToTransaction';

type SpanWithPrivate = Span & {
  [END_TIME_SCOPE_FIELD]?: number;
  [CONVERT_SPAN_TO_TRANSACTION_FIELD]?: () => TransactionEvent | undefined;
};

/**
 *
 */
export function setEndTimeValue(span: Span, endTimestamp: number): void {
  (span as SpanWithPrivate)['_endTime'] = endTimestamp;
}

/**
 *
 */
export function convertSpanToTransaction(span: Span): TransactionEvent | undefined {
  return (span as SpanWithPrivate)['_convertSpanToTransaction']?.();
}
