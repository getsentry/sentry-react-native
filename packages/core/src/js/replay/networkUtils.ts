import { encodeUTF8 } from '../utils/encode';

/** Convert a Content-Length header to number/undefined. */
export function parseContentLengthHeader(header: string | null | undefined): number | undefined {
  if (!header) {
    return undefined;
  }

  const size = parseInt(header, 10);
  return isNaN(size) ? undefined : size;
}

export type RequestBody = null | Blob | FormData | URLSearchParams | string | ArrayBuffer | undefined;

/** Get the size of a body. */
export function getBodySize(body: RequestBody): number | undefined {
  if (!body) {
    return undefined;
  }

  try {
    if (typeof body === 'string') {
      return encodeUTF8(body).length;
    }

    if (body instanceof URLSearchParams) {
      return encodeUTF8(body.toString()).length;
    }

    if (body instanceof FormData) {
      const formDataStr = _serializeFormData(body);
      return encodeUTF8(formDataStr).length;
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

function _serializeFormData(formData: FormData): string {
  // This is a bit simplified, but gives us a decent estimate
  // This converts e.g. { name: 'Anne Smith', age: 13 } to 'name=Anne+Smith&age=13'
  // @ts-expect-error passing FormData to URLSearchParams won't correctly serialize `File` entries, which is fine for this use-case. See https://github.com/microsoft/TypeScript/issues/30584
  return new URLSearchParams(formData).toString();
}

export const NETWORK_BODY_MAX_SIZE = 150_000;

export const DEFAULT_NETWORK_HEADERS = ['content-type', 'content-length', 'accept'];

const DENY_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'proxy-authorization',
]);

export interface ResolvedNetworkOptions {
  allowUrls: (string | RegExp)[];
  denyUrls: (string | RegExp)[];
  captureBodies: boolean;
  requestHeaders: string[];
  responseHeaders: string[];
}

/**
 * Check if a URL matches any pattern in the list. Strings use substring match
 * (empty strings are ignored to avoid matching everything by accident);
 * RegExp uses `.test()` with `lastIndex` reset so global-flag patterns are
 * stateless across calls.
 */
function _urlMatches(url: string, patterns: (string | RegExp)[]): boolean {
  for (const pattern of patterns) {
    if (typeof pattern === 'string') {
      if (pattern.length > 0 && url.indexOf(pattern) !== -1) {
        return true;
      }
    } else if (pattern instanceof RegExp) {
      // Reset lastIndex to make /g and /y patterns idempotent across calls.
      pattern.lastIndex = 0;
      if (pattern.test(url)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Whether to capture full network details (headers, bodies) for a given URL,
 * based on the allow/deny URL lists.
 */
export function shouldCaptureNetworkDetails(url: string | undefined, options: ResolvedNetworkOptions): boolean {
  if (!url || options.allowUrls.length === 0) {
    return false;
  }
  if (!_urlMatches(url, options.allowUrls)) {
    return false;
  }
  if (options.denyUrls.length > 0 && _urlMatches(url, options.denyUrls)) {
    return false;
  }
  return true;
}

export interface NetworkBody {
  body?: string;
  /** Warnings about the captured body, e.g. truncation or unserializable type. */
  _meta?: { warnings: string[] };
}

/**
 * Serialize a request/response body to a string, truncated to NETWORK_BODY_MAX_SIZE.
 * Returns undefined if the body is empty/missing; returns a meta warning if unserializable
 * or truncated.
 */
export function getBodyString(body: unknown): NetworkBody | undefined {
  if (body == null) {
    return undefined;
  }

  try {
    let bodyStr: string | undefined;

    if (typeof body === 'string') {
      bodyStr = body;
    } else if (typeof body === 'number' || typeof body === 'boolean') {
      // JSON primitives (e.g. `xhr.response` with responseType='json' returning `42` or `true`)
      bodyStr = String(body);
    } else if (body instanceof URLSearchParams) {
      bodyStr = body.toString();
    } else if (body instanceof FormData) {
      bodyStr = _serializeFormData(body);
    } else if (body instanceof Blob || body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
      // Binary payloads (Blob, ArrayBuffer, typed arrays like Uint8Array)
      // can't be safely inlined as text; record the type but skip the body.
      return { _meta: { warnings: ['UNPARSEABLE_BODY_TYPE'] } };
    } else if (typeof body === 'object') {
      // Last-ditch attempt: try to JSON-stringify plain objects (e.g. xhr.response with responseType='json')
      try {
        bodyStr = JSON.stringify(body);
      } catch {
        return { _meta: { warnings: ['UNPARSEABLE_BODY_TYPE'] } };
      }
    }

    if (bodyStr === undefined) {
      return { _meta: { warnings: ['UNPARSEABLE_BODY_TYPE'] } };
    }

    if (bodyStr.length > NETWORK_BODY_MAX_SIZE) {
      return {
        body: bodyStr.slice(0, NETWORK_BODY_MAX_SIZE),
        _meta: { warnings: ['MAX_BODY_SIZE_EXCEEDED'] },
      };
    }

    return { body: bodyStr };
  } catch {
    return { _meta: { warnings: ['UNPARSEABLE_BODY_TYPE'] } };
  }
}

/**
 * Filter a headers map down to the set explicitly captured (defaults + user-supplied)
 * and strip authorization-like headers. Header name comparison is case-insensitive;
 * the returned keys are lowercased.
 */
export function filterHeaders(
  headers: Record<string, string | null | undefined> | undefined,
  extraAllowed: string[],
): Record<string, string> | undefined {
  if (!headers) {
    return undefined;
  }
  const allowed = new Set([...DEFAULT_NETWORK_HEADERS, ...extraAllowed.map(h => h.toLowerCase())]);
  const out: Record<string, string> = {};
  let count = 0;
  for (const rawName of Object.keys(headers)) {
    const name = rawName.toLowerCase();
    if (DENY_HEADERS.has(name)) {
      continue;
    }
    if (!allowed.has(name)) {
      continue;
    }
    const value = headers[rawName];
    if (value == null) {
      continue;
    }
    out[name] = value;
    count += 1;
  }
  return count > 0 ? out : undefined;
}

/** Parse the raw string returned by XMLHttpRequest.getAllResponseHeaders() into a record. */
export function parseAllResponseHeaders(raw: string | null | undefined): Record<string, string> {
  if (!raw) {
    return {};
  }
  const result: Record<string, string> = {};
  // Headers are CRLF-delimited; some implementations use LF only.
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (!line) {
      continue;
    }
    const idx = line.indexOf(':');
    if (idx === -1) {
      continue;
    }
    const name = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (name) {
      result[name] = value;
    }
  }
  return result;
}
