import type { EnvelopeItem, Exception } from '@sentry/types';

type EnvelopeItemPayload = EnvelopeItem[1];

/**
 * Extracts the hard crash information from the event exceptions.
 * No exceptions or undefined handled are not hard crashes.
 *
 * Hard crashes are only unhandled error, not user set unhandled mechanisms.
 */
export function isHardCrash(payload: EnvelopeItemPayload): boolean {
  const values: Exception[] =
    typeof payload !== 'string' && 'exception' in payload && payload.exception?.values ? payload.exception.values : [];
  for (const exception of values) {
    if (exception.mechanism && exception.mechanism.handled === false && exception.mechanism.type === 'onerror') {
      return true;
    }
  }
  return false;
}
