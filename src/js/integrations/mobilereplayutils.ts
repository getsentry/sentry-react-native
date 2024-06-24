import type { Breadcrumb, BreadcrumbHint,SentryWrappedXMLHttpRequest, XhrBreadcrumbHint } from '@sentry/types';
import { dropUndefinedKeys } from '@sentry/utils';

import { utf8ToBytes } from '../vendor';

/**
 *
 */
export function enrichNetworkBreadcrumbsForMobileReplay(breadcrumb: Breadcrumb, hint: BreadcrumbHint | undefined): void {
  if (breadcrumb.type !== 'xhr' || !hint) {
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


function _serializeFormData(formData: FormData): string {
  // This is a bit simplified, but gives us a decent estimate
  // This converts e.g. { name: 'Anne Smith', age: 13 } to 'name=Anne+Smith&age=13'
  // @ts-expect-error passing FormData to URLSearchParams actually works
  return new URLSearchParams(formData).toString();
}

/** Get the size of a body. */
export function getBodySize(body: RequestBody): number | undefined {
  if (!body) {
    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/unbound-method
  const encode = global.TextEncoder ? (new TextEncoder()).encode : utf8ToBytes;

  try {
    if (typeof body === 'string') {
      return encode(body).length;
    }

    if (body instanceof URLSearchParams) {
      return encode(body.toString()).length;
    }

    if (body instanceof FormData) {
      const formDataStr = _serializeFormData(body);
      return encode(formDataStr).length;
    }

    if (body instanceof Blob) {
      return body.size;
    }

    if (body instanceof ArrayBuffer) {
      return body.byteLength;
    }

    // Currently unhandled types: ArrayBufferView, ReadableStream
  } catch {
    // just return undefined
  }

  return undefined;
}

type RequestBody = null | Blob | FormData | URLSearchParams | string | ArrayBuffer | undefined;

export type XhrHint = XhrBreadcrumbHint & {
  xhr: XMLHttpRequest & SentryWrappedXMLHttpRequest;
  input?: RequestBody;
};

/** Convert a Content-Length header to number/undefined.  */
export function parseContentLengthHeader(header: string | null | undefined): number | undefined {
  if (!header) {
    return undefined;
  }

  const size = parseInt(header, 10);
  return isNaN(size) ? undefined : size;
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
