import type { Breadcrumb, BreadcrumbHint, SentryWrappedXMLHttpRequest, XhrBreadcrumbHint } from '@sentry/types';
import { dropUndefinedKeys } from '@sentry/utils';

import type { RequestBody } from './networkUtils';
import { getBodySize, parseContentLengthHeader } from './networkUtils';

/**
 * Enrich an XHR breadcrumb with additional data for Mobile Replay network tab.
 */
export function enrichXhrBreadcrumbsForMobileReplay(breadcrumb: Breadcrumb, hint: BreadcrumbHint | undefined): void {
  if (breadcrumb.category !== 'xhr' || !hint) {
    return;
  }

  const xhrHint = hint as Partial<XhrHint>;
  if (!xhrHint.xhr) {
    return;
  }

  const now = Date.now();
  const { startTimestamp = now, endTimestamp = now, input, xhr } = xhrHint;

  const reqSize = getBodySize(input);
  const resSize = xhr.getResponseHeader('content-length')
    ? parseContentLengthHeader(xhr.getResponseHeader('content-length'))
    : _getBodySize(xhr.response, xhr.responseType);

  breadcrumb.data = dropUndefinedKeys({
    start_timestamp: startTimestamp,
    end_timestamp: endTimestamp,
    request_body_size: reqSize,
    response_body_size: resSize,
    ...breadcrumb.data,
  });
}

type XhrHint = XhrBreadcrumbHint & {
  xhr: XMLHttpRequest & SentryWrappedXMLHttpRequest;
  input?: RequestBody;
};

function _getBodySize(
  body: XMLHttpRequest['response'],
  responseType: XMLHttpRequest['responseType'],
): number | undefined {
  try {
    const bodyStr = responseType === 'json' && body && typeof body === 'object' ? JSON.stringify(body) : body;
    return getBodySize(bodyStr);
  } catch {
    return undefined;
  }
}
