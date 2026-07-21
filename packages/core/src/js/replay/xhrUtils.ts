import type { Breadcrumb, BreadcrumbHint, SentryWrappedXMLHttpRequest, XhrBreadcrumbHint } from '@sentry/core';

import { dropUndefinedKeys } from '@sentry/core';

import type { NetworkBody, RequestBody, ResolvedNetworkOptions } from './networkUtils';

import {
  decodeUtf8,
  filterHeaders,
  getBodySize,
  getBodyString,
  isTextLikeContentType,
  NETWORK_BODY_MAX_SIZE,
  NETWORK_BODY_READ_TIMEOUT_MS,
  parseAllResponseHeaders,
  parseContentLengthHeader,
  readBlobAsText,
  shouldCaptureNetworkDetails,
} from './networkUtils';

interface NetworkBreadcrumbSide {
  body?: string;
  headers?: Record<string, string>;
  _meta?: { warnings: string[] };
}

/**
 * Hint key carrying the result of `resolveXhrResponseBody` for a breadcrumb
 * that was held while its binary (Blob / ArrayBuffer) response body was read
 * asynchronously. When present, enrichment reads the body and all request /
 * response metadata from this snapshot instead of the live `xhr`, which may
 * have been reused or cleared by the time the breadcrumb is re-added.
 */
export const REPLAY_RESOLVED_RESPONSE_BODY_HINT_KEY = '__mobile_replay_resolved_response_body__';

/**
 * An asynchronously resolved response body plus the request / response
 * metadata snapshotted synchronously at the time the breadcrumb was held.
 */
export interface ResolvedXhrResponse {
  body: NetworkBody;
  requestHeaders: Record<string, string> | undefined;
  rawResponseHeaders: string | null;
  responseBodySize: number | undefined;
}

type ResolvedBodyCarrier = { [REPLAY_RESOLVED_RESPONSE_BODY_HINT_KEY]?: ResolvedXhrResponse };

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

  // A held-and-re-added breadcrumb carries a snapshot taken while the xhr was
  // still current — read from it, never from the (possibly reused) live xhr.
  const resolved = (hint as ResolvedBodyCarrier)[REPLAY_RESOLVED_RESPONSE_BODY_HINT_KEY];

  const reqSize = getBodySize(input);
  const resSize = resolved ? resolved.responseBodySize : _getXhrResponseBodySize(xhr);

  let request: NetworkBreadcrumbSide | undefined;
  let response: NetworkBreadcrumbSide | undefined;

  const url = typeof breadcrumb.data?.url === 'string' ? breadcrumb.data.url : undefined;

  if (shouldCaptureNetworkDetails(url, networkOptions)) {
    request = _buildRequestDetails(
      input,
      resolved ? resolved.requestHeaders : xhr.__sentry_xhr_v3__?.request_headers,
      networkOptions,
    );
    response = _buildResponseDetails(xhr, networkOptions, resolved);
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
  requestHeaders: Record<string, string> | undefined,
  networkOptions: ResolvedNetworkOptions,
): NetworkBreadcrumbSide | undefined {
  const headers = filterHeaders(requestHeaders, networkOptions.requestHeaders);

  let body: NetworkBody | undefined;
  if (networkOptions.captureBodies) {
    body = getBodyString(input);
  }

  return _toBreadcrumbSide(headers, body);
}

function _buildResponseDetails(
  xhr: XMLHttpRequest & SentryWrappedXMLHttpRequest,
  networkOptions: ResolvedNetworkOptions,
  resolved: ResolvedXhrResponse | undefined,
): NetworkBreadcrumbSide | undefined {
  const rawHeaders = resolved ? resolved.rawResponseHeaders : _getAllResponseHeaders(xhr);
  const headers = filterHeaders(parseAllResponseHeaders(rawHeaders), networkOptions.responseHeaders);

  let body: NetworkBody | undefined;
  if (networkOptions.captureBodies) {
    body = resolved ? resolved.body : _getResponseBodyString(xhr);
  }

  return _toBreadcrumbSide(headers, body);
}

function _getAllResponseHeaders(xhr: XMLHttpRequest): string | null {
  try {
    return xhr.getAllResponseHeaders();
  } catch {
    // some environments may throw before the request is complete
    return null;
  }
}

function _getXhrResponseBodySize(xhr: XMLHttpRequest): number | undefined {
  const contentLength = xhr.getResponseHeader('content-length');
  return contentLength ? parseContentLengthHeader(contentLength) : _getBodySize(xhr.response, xhr.responseType);
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

/**
 * Whether this xhr breadcrumb's response body can only be captured asynchronously:
 * a binary responseType (`blob` / `arraybuffer`) holding a text-like payload, for
 * an allow-listed URL with body capture enabled. React Native's `fetch` polyfill
 * always uses responseType `blob`, so every `fetch` response takes this path.
 */
export function shouldCaptureResponseBodyAsync(
  breadcrumb: Breadcrumb,
  hint: BreadcrumbHint | undefined,
  networkOptions: ResolvedNetworkOptions,
): hint is XhrHint {
  if (breadcrumb.category !== 'xhr' || !hint) {
    return false;
  }
  if ((hint as ResolvedBodyCarrier)[REPLAY_RESOLVED_RESPONSE_BODY_HINT_KEY] !== undefined) {
    // already resolved — this is the re-added breadcrumb
    return false;
  }
  const xhr = (hint as Partial<XhrHint>).xhr;
  if (!xhr || (xhr.responseType !== 'blob' && xhr.responseType !== 'arraybuffer') || xhr.response == null) {
    return false;
  }
  if (!networkOptions.captureBodies) {
    return false;
  }
  const url = typeof breadcrumb.data?.url === 'string' ? breadcrumb.data.url : undefined;
  if (!shouldCaptureNetworkDetails(url, networkOptions)) {
    return false;
  }
  let contentType: string | null = null;
  try {
    contentType = xhr.getResponseHeader('content-type');
  } catch {
    // ignore — treated as non-text below
  }
  return isTextLikeContentType(contentType);
}

/**
 * Read the body of a binary (`blob` / `arraybuffer`) XHR response and serialize
 * it like a text body (size cap + truncation warning), together with the
 * request / response metadata snapshotted synchronously — by the time the body
 * read settles, the xhr may have been reused or cleared, so the re-added
 * breadcrumb must not read from it again. Resolves the body to an
 * UNPARSEABLE_BODY_TYPE warning on read failure or timeout — never rejects.
 */
export async function resolveXhrResponseBody(
  xhr: XMLHttpRequest & SentryWrappedXMLHttpRequest,
): Promise<ResolvedXhrResponse> {
  let requestHeaders: Record<string, string> | undefined;
  let rawResponseHeaders: string | null = null;
  let responseBodySize: number | undefined;
  try {
    requestHeaders = xhr.__sentry_xhr_v3__?.request_headers;
    rawResponseHeaders = _getAllResponseHeaders(xhr);
    responseBodySize = _getXhrResponseBodySize(xhr);
  } catch {
    // keep the defaults — the metadata snapshot is best-effort
  }
  return { body: await _readBinaryResponseBody(xhr), requestHeaders, rawResponseHeaders, responseBodySize };
}

async function _readBinaryResponseBody(xhr: XMLHttpRequest): Promise<NetworkBody> {
  try {
    if (xhr.responseType === 'blob') {
      const blob = xhr.response as Blob;
      const truncated = blob.size > NETWORK_BODY_MAX_SIZE;
      // Slice before reading so a huge payload is never fully read into memory.
      const capped = truncated ? blob.slice(0, NETWORK_BODY_MAX_SIZE) : blob;
      const text = await readBlobAsText(capped, NETWORK_BODY_READ_TIMEOUT_MS);
      return _toCappedBody(text, truncated);
    }
    if (xhr.responseType === 'arraybuffer') {
      const buffer = xhr.response as ArrayBuffer;
      const truncated = buffer.byteLength > NETWORK_BODY_MAX_SIZE;
      const bytes = new Uint8Array(buffer, 0, truncated ? NETWORK_BODY_MAX_SIZE : buffer.byteLength);
      return _toCappedBody(decodeUtf8(bytes), truncated);
    }
  } catch {
    // fall through to the unparseable marker
  }
  return { _meta: { warnings: ['UNPARSEABLE_BODY_TYPE'] } };
}

function _toCappedBody(text: string, truncated: boolean): NetworkBody {
  // The byte cap above already keeps `text` at or below the char cap
  // (UTF-8 is at least one byte per char), so only the warning is left to add.
  const body = getBodyString(text) ?? { body: text };
  if (truncated) {
    return { ...body, _meta: { warnings: [...(body._meta?.warnings ?? []), 'MAX_BODY_SIZE_EXCEEDED'] } };
  }
  return body;
}

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
