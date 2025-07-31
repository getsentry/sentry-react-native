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
