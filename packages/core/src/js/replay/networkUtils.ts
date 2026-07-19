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

/** How long to wait for an async body read (FileReader) before giving up. */
export const NETWORK_BODY_READ_TIMEOUT_MS = 500;

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
 * Whether a Content-Type describes a payload that is safe to decode into text
 * (JSON, XML, form data, `text/*`). Genuinely binary payloads (images, media,
 * octet-stream) are excluded so they stay marked as unparseable.
 */
export function isTextLikeContentType(contentType: string | null | undefined): boolean {
  if (!contentType) {
    return false;
  }
  const normalized = contentType.toLowerCase();
  return (
    normalized.startsWith('text/') ||
    normalized.includes('json') ||
    normalized.includes('xml') ||
    normalized.includes('x-www-form-urlencoded')
  );
}

/**
 * Read a Blob as UTF-8 text via FileReader (React Native's Blob has no `text()`).
 * Rejects on read error, abort or after `timeoutMs`.
 */
export function readBlobAsText(blob: Blob, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const timeout = setTimeout(() => {
      // reject first — abort() may fire onabort synchronously
      reject(new Error(`Timed out reading response body after ${timeoutMs}ms`));
      try {
        reader.abort();
      } catch {
        // ignore — already rejected
      }
    }, timeoutMs);
    reader.onload = () => {
      clearTimeout(timeout);
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(result);
      } else {
        reject(new Error('FileReader did not produce a string result'));
      }
    };
    reader.onerror = () => {
      clearTimeout(timeout);
      reject(reader.error ?? new Error('FileReader failed'));
    };
    reader.onabort = () => {
      clearTimeout(timeout);
      reject(new Error('FileReader aborted'));
    };
    reader.readAsText(blob);
  });
}

type TextDecoderLike = { decode(input: Uint8Array): string };

/* oxlint-disable eslint(no-bitwise) -- decoding UTF-8 is inherently bit manipulation */
/**
 * Decode UTF-8 bytes into a string. Uses the global TextDecoder when the JS
 * engine provides one and falls back to a manual decoder otherwise (Hermes
 * has no TextDecoder). Invalid sequences decode to U+FFFD.
 */
export function decodeUtf8(bytes: Uint8Array): string {
  const TextDecoderConstructor = (globalThis as { TextDecoder?: new () => TextDecoderLike }).TextDecoder;
  if (TextDecoderConstructor) {
    try {
      return new TextDecoderConstructor().decode(bytes);
    } catch {
      // fall through to the manual decoder
    }
  }

  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const byte = bytes[i] ?? 0;
    let codePoint: number;
    let extraBytes: number;
    if (byte < 0x80) {
      codePoint = byte;
      extraBytes = 0;
    } else if ((byte & 0xe0) === 0xc0) {
      codePoint = byte & 0x1f;
      extraBytes = 1;
    } else if ((byte & 0xf0) === 0xe0) {
      codePoint = byte & 0x0f;
      extraBytes = 2;
    } else if ((byte & 0xf8) === 0xf0) {
      codePoint = byte & 0x07;
      extraBytes = 3;
    } else {
      out += '�';
      i += 1;
      continue;
    }

    let consumed = 0;
    while (consumed < extraBytes && i + 1 + consumed < bytes.length) {
      const continuation = bytes[i + 1 + consumed] ?? 0;
      if ((continuation & 0xc0) !== 0x80) {
        break;
      }
      codePoint = (codePoint << 6) | (continuation & 0x3f);
      consumed += 1;
    }

    if (consumed < extraBytes) {
      // truncated or interrupted sequence: the consumed prefix decodes to one
      // U+FFFD and decoding resumes at the offending byte (maximal subpart)
      out += '�';
      i += consumed + 1;
      continue;
    }

    if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
      out += '�';
      i += 1;
      continue;
    }

    out += String.fromCodePoint(codePoint);
    i += extraBytes + 1;
  }
  return out;
}
/* oxlint-enable eslint(no-bitwise) */

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
