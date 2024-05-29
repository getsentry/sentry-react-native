import { getRootSpan, SentrySpan } from '@sentry/core';
import type { Span } from '@sentry/types';

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
