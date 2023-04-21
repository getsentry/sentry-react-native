import { normalize } from '@sentry/utils';

/**
 * Converts any input into a valid record with string keys.
 */
export function convertToRecord(wat: unknown): Record<string, unknown> {
  const normalized: unknown = normalize(wat);
  if (typeof normalized !== 'object') {
    return {
      unknown: normalized,
    };
  } else {
    return normalized as Record<string, unknown>;
  }
}
