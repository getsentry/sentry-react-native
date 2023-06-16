import { normalize } from '@sentry/utils';

const KEY = 'value';

/**
 * Converts any input into a valid record with string keys.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function convertToNormalizedObject(data: unknown): Record<string, any> {
  const normalized: unknown = normalize(data);
  if (normalized === null || typeof normalized !== 'object') {
    return {
      [KEY]: normalized,
    };
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return normalized as Record<string, any>;
  }
}
