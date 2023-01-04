import { Breadcrumb, SeverityLevel } from '@sentry/types';
import { severityLevelFromString } from '@sentry/utils';

export const DEFAULT_BREADCRUMB_LEVEL: SeverityLevel = 'error';

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
