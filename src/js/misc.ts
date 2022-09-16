import {
  Event,
} from '@sentry/types';

/**
 * Recognizes an Event based on 'exception' property.
 */
export function isEvent(event: unknown): event is Event {
  return typeof event === 'object' && event !== null && 'exception' in event;
}

/**
 * Extracts the hard crash information from the event exceptions.
 * No exceptions or undefined handled are not hard crashes.
 */
export function isHardCrash(event: Event): boolean {
  for (const exception of event.exception?.values ?? []) {
    if (!(exception.mechanism?.handled !== false)) {
      return true;
    }
  }
  return false;
}
