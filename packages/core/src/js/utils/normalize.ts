import { normalize } from '@sentry/core';

const KEY = 'value';

/**
 * Converts any input into a valid record with string keys.
 */
// oxlint-disable-next-line typescript-eslint(no-explicit-any)
export function convertToNormalizedObject(data: unknown): Record<string, any> {
  const normalized: unknown = normalize(data);
  if (
    normalized !== null &&
    typeof normalized === 'object' &&
    !Array.isArray(normalized) &&
    normalized.constructor === Object
  ) {
    // oxlint-disable-next-line typescript-eslint(no-explicit-any)
    return normalized as Record<string, any>;
  } else {
    return {
      [KEY]: normalized,
    };
  }
}
