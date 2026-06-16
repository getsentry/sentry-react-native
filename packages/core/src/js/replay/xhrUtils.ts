import type { Breadcrumb, BreadcrumbHint, SentryWrappedXMLHttpRequest, XhrBreadcrumbHint } from '@sentry/core';

import { dropUndefinedKeys } from '@sentry/core';

import type { NetworkBody, RequestBody, ResolvedNetworkOptions } from './networkUtils';

import {
  filterHeaders,
  getBodySize,
  getBodyString,
  parseAllResponseHeaders,
  parseContentLengthHeader,
  shouldCaptureNetworkDetails,
} from './networkUtils';

interface NetworkBreadcrumbSide {
  body?: string;
  headers?: Record<string, string>;
  _meta?: { warnings: string[] };
}

const DEFAULT_NETWORK_OPTIONS: ResolvedNetworkOptions = {
  allowUrls: [],
  denyUrls: [],
  captureBodies: false,
  requestHeaders: [],
  responseHeaders: [],
};

/**
 * Build a `beforeAddBreadcrumb` handler that enriches XHR breadcrumbs with
 * network details (sizes always; headers/bodies for URLs matching the allow
 * list and not the deny list) for the Mobile Replay network tab.
 */
export function makeEnrichXhrBreadcrumbsForMobileReplay(
  networkOptions: ResolvedNetworkOptions,
): (breadcrumb: Breadcrumb, hint: BreadcrumbHint | undefined) => void {
  return (breadcrumb, hint) => enrichXhrBreadcrumb(breadcrumb, hint, networkOptions);
}

/**
 * Enrich an XHR breadcrumb with additional data for Mobile Replay network tab.
 * Preserves the legacy behaviour: sizes only, no headers/bodies.
 */
export function enrichXhrBreadcrumbsForMobileReplay(breadcrumb: Breadcrumb, hint: BreadcrumbHint | undefined): void {
  enrichXhrBreadcrumb(breadcrumb, hint, DEFAULT_NETWORK_OPTIONS);
}

function enrichXhrBreadcrumb(
  breadcrumb: Breadcrumb,
  hint: BreadcrumbHint | undefined,
  networkOptions: ResolvedNetworkOptions,
): void {
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

  let request: NetworkBreadcrumbSide | undefined;
  let response: NetworkBreadcrumbSide | undefined;

  const url = typeof breadcrumb.data?.url === 'string' ? breadcrumb.data.url : undefined;

  if (shouldCaptureNetworkDetails(url, networkOptions)) {
    request = _buildRequestDetails(input, xhr, networkOptions);
    response = _buildResponseDetails(xhr, networkOptions);
  }

  breadcrumb.data = dropUndefinedKeys({
    start_timestamp: startTimestamp,
    end_timestamp: endTimestamp,
    request_body_size: reqSize,
    response_body_size: resSize,
    ...breadcrumb.data,
    request,
    response,
  });
}

function _buildRequestDetails(
  input: RequestBody | undefined,
  xhr: XMLHttpRequest & SentryWrappedXMLHttpRequest,
  networkOptions: ResolvedNetworkOptions,
): NetworkBreadcrumbSide | undefined {
  const sentryXhr = xhr.__sentry_xhr_v3__;
  const headers = filterHeaders(sentryXhr?.request_headers, networkOptions.requestHeaders);

  let body: NetworkBody | undefined;
  if (networkOptions.captureBodies) {
    body = getBodyString(input);
  }

  return _toBreadcrumbSide(headers, body);
}

function _buildResponseDetails(
  xhr: XMLHttpRequest & SentryWrappedXMLHttpRequest,
  networkOptions: ResolvedNetworkOptions,
): NetworkBreadcrumbSide | undefined {
  let rawHeaders: string | null = null;
  try {
    rawHeaders = xhr.getAllResponseHeaders();
  } catch {
    // ignore — some environments may throw before the request is complete
  }
  const headers = filterHeaders(parseAllResponseHeaders(rawHeaders), networkOptions.responseHeaders);

  let body: NetworkBody | undefined;
  if (networkOptions.captureBodies) {
    body = _getResponseBodyString(xhr);
  }

  return _toBreadcrumbSide(headers, body);
}

function _toBreadcrumbSide(
  headers: Record<string, string> | undefined,
  body: NetworkBody | undefined,
): NetworkBreadcrumbSide | undefined {
  const side: NetworkBreadcrumbSide = {};
  if (headers) {
    side.headers = headers;
  }
  if (body?.body !== undefined) {
    side.body = body.body;
  }
  if (body?._meta) {
    side._meta = body._meta;
    // Native converters strip `_meta` before forwarding the side to the rrweb
    // span (the native replay SDKs don't know about it). Materialize a
    // placeholder `body` whenever we have a warning but no concrete body so
    // the signal (e.g. UNPARSEABLE_BODY_TYPE) still surfaces in Session
    // Replay instead of being silently dropped natively.
    if (side.body === undefined) {
      side.body = `[${body._meta.warnings.join(', ')}]`;
    }
  }
  return Object.keys(side).length > 0 ? side : undefined;
}

function _getResponseBodyString(xhr: XMLHttpRequest): NetworkBody | undefined {
  try {
    if (xhr.responseType === '' || xhr.responseType === 'text') {
      // responseText only exists for text/empty responseType
      return getBodyString(xhr.responseText);
    }
    if (xhr.responseType === 'json') {
      return getBodyString(xhr.response);
    }
    if (xhr.response == null) {
      return undefined;
    }
    // For 'blob' / 'arraybuffer' / 'document' we don't attempt to inline binary data.
    return { _meta: { warnings: ['UNPARSEABLE_BODY_TYPE'] } };
  } catch {
    return { _meta: { warnings: ['UNPARSEABLE_BODY_TYPE'] } };
  }
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
