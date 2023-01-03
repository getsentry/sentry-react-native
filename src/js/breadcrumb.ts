import { Breadcrumb } from '@sentry/types';
import { normalize, severityLevelFromString } from '@sentry/utils';

type BreadcrumbCandidate = {
  [K in keyof Partial<Breadcrumb>]: unknown;
}

/**
 * Convert plain object to a valid Breadcrumb
 */
export function breadcrumbFromObject(candidate: BreadcrumbCandidate): Breadcrumb {
  const breadcrumb: Breadcrumb = {};

  if (typeof candidate.type === 'string') {
    breadcrumb.type = candidate.type;
  }
  if (typeof candidate.level === 'string') {
    breadcrumb.level = severityLevelFromString(candidate.level);
  }
  if (typeof candidate.event_id === 'string') {
    breadcrumb.event_id = candidate.event_id;
  }
  if (typeof candidate.category === 'string') {
    breadcrumb.category = candidate.category;
  }
  if (typeof candidate.message === 'string') {
    breadcrumb.message = candidate.message;
  }
  if (typeof candidate.data === 'object' && candidate.data !== null) {
    breadcrumb.data = candidate.data;
  }
  if (typeof candidate.timestamp === 'string') {
    const timestamp = Date.parse(candidate.timestamp)
    if (!isNaN(timestamp)) {
      breadcrumb.timestamp = timestamp;
    }
  }

  return breadcrumb;
}

/**
 * Compares two breadcrumbs and returns true if they are equal
 * Warning: This function does not check timestamp and level, data
 */
export function breadcrumbEquals(breadcrumb: Breadcrumb, other: Breadcrumb): boolean {
  return (
    breadcrumb.category === other.category &&
    breadcrumb.event_id === other.event_id &&
    breadcrumb.message === other.message &&
    breadcrumb.type === other.type
  );
}
