import type { Breadcrumb } from '@sentry/core';

import type { ResolvedNetworkOptions } from '../../src/js/replay/networkUtils';

import { NETWORK_BODY_MAX_SIZE } from '../../src/js/replay/networkUtils';
import {
  enrichXhrBreadcrumbsForMobileReplay,
  makeEnrichXhrBreadcrumbsForMobileReplay,
  REPLAY_RESOLVED_RESPONSE_BODY_HINT_KEY,
  resolveXhrResponseBody,
  shouldCaptureResponseBodyAsync,
} from '../../src/js/replay/xhrUtils';

describe('xhrUtils', () => {
  describe('enrichXhrBreadcrumbsForMobileReplay', () => {
    it('only changes xhr category breadcrumbs', () => {
      const breadcrumb: Breadcrumb = { category: 'http' };
      enrichXhrBreadcrumbsForMobileReplay(breadcrumb, getValidXhrHint());
      expect(breadcrumb).toEqual({ category: 'http' });
    });

    it('does nothing without hint', () => {
      const breadcrumb: Breadcrumb = { category: 'xhr' };
      enrichXhrBreadcrumbsForMobileReplay(breadcrumb, undefined);
      expect(breadcrumb).toEqual({ category: 'xhr' });
    });

    it('does nothing without xhr hint', () => {
      const breadcrumb: Breadcrumb = { category: 'xhr' };
      enrichXhrBreadcrumbsForMobileReplay(breadcrumb, {});
      expect(breadcrumb).toEqual({ category: 'xhr' });
    });

    it('set start and end timestamp', () => {
      const breadcrumb: Breadcrumb = { category: 'xhr' };
      enrichXhrBreadcrumbsForMobileReplay(breadcrumb, getValidXhrHint());
      expect(breadcrumb.data).toEqual(
        expect.objectContaining({
          start_timestamp: 1,
          end_timestamp: 2,
        }),
      );
    });

    it('uses now as default timestamp', () => {
      const breadcrumb: Breadcrumb = { category: 'xhr' };
      enrichXhrBreadcrumbsForMobileReplay(breadcrumb, {
        ...getValidXhrHint(),
        startTimestamp: undefined,
        endTimestamp: undefined,
      });
      expect(breadcrumb.data).toEqual(
        expect.objectContaining({
          start_timestamp: expect.any(Number),
          end_timestamp: expect.any(Number),
        }),
      );
    });

    it('sets request body size', () => {
      const breadcrumb: Breadcrumb = { category: 'xhr' };
      enrichXhrBreadcrumbsForMobileReplay(breadcrumb, getValidXhrHint());
      expect(breadcrumb.data).toEqual(
        expect.objectContaining({
          request_body_size: 10,
        }),
      );
    });

    it('sets response body size', () => {
      const breadcrumb: Breadcrumb = { category: 'xhr' };
      enrichXhrBreadcrumbsForMobileReplay(breadcrumb, getValidXhrHint());
      expect(breadcrumb.data).toEqual(
        expect.objectContaining({
          response_body_size: 13,
        }),
      );
    });

    it('does not capture bodies or headers when allow list is empty', () => {
      const breadcrumb: Breadcrumb = { category: 'xhr', data: { url: 'https://api.example.com/users' } };
      enrichXhrBreadcrumbsForMobileReplay(breadcrumb, getValidXhrHint());
      expect(breadcrumb.data?.request).toBeUndefined();
      expect(breadcrumb.data?.response).toBeUndefined();
    });
  });

  describe('makeEnrichXhrBreadcrumbsForMobileReplay', () => {
    it('captures request and response when url matches allow list', () => {
      const enrich = makeEnrichXhrBreadcrumbsForMobileReplay({
        allowUrls: ['api.example.com'],
        denyUrls: [],
        captureBodies: true,
        requestHeaders: [],
        responseHeaders: [],
      });

      const breadcrumb: Breadcrumb = { category: 'xhr', data: { url: 'https://api.example.com/users' } };
      enrich(breadcrumb, getValidXhrHint());

      expect(breadcrumb.data?.request).toEqual({
        body: 'test-input',
        headers: { 'content-type': 'application/json' },
      });
      expect(breadcrumb.data?.response).toEqual(
        expect.objectContaining({
          body: '{"ok":true}',
          headers: expect.objectContaining({ 'content-type': 'application/json' }),
        }),
      );
    });

    it('skips capture when URL does not match allow list', () => {
      const enrich = makeEnrichXhrBreadcrumbsForMobileReplay({
        allowUrls: ['api.other.com'],
        denyUrls: [],
        captureBodies: true,
        requestHeaders: [],
        responseHeaders: [],
      });

      const breadcrumb: Breadcrumb = { category: 'xhr', data: { url: 'https://api.example.com/users' } };
      enrich(breadcrumb, getValidXhrHint());

      expect(breadcrumb.data?.request).toBeUndefined();
      expect(breadcrumb.data?.response).toBeUndefined();
    });

    it('skips capture when URL matches deny list', () => {
      const enrich = makeEnrichXhrBreadcrumbsForMobileReplay({
        allowUrls: ['api.example.com'],
        denyUrls: ['/users'],
        captureBodies: true,
        requestHeaders: [],
        responseHeaders: [],
      });

      const breadcrumb: Breadcrumb = { category: 'xhr', data: { url: 'https://api.example.com/users' } };
      enrich(breadcrumb, getValidXhrHint());

      expect(breadcrumb.data?.request).toBeUndefined();
      expect(breadcrumb.data?.response).toBeUndefined();
    });

    it('ignores empty-string allow patterns instead of matching every URL', () => {
      const enrich = makeEnrichXhrBreadcrumbsForMobileReplay({
        allowUrls: ['', 'api.other.com'],
        denyUrls: [],
        captureBodies: true,
        requestHeaders: [],
        responseHeaders: [],
      });

      const breadcrumb: Breadcrumb = { category: 'xhr', data: { url: 'https://api.example.com/users' } };
      enrich(breadcrumb, getValidXhrHint());

      expect(breadcrumb.data?.request).toBeUndefined();
      expect(breadcrumb.data?.response).toBeUndefined();
    });

    it('handles global-flag RegExp patterns idempotently across calls', () => {
      const globalPattern = /api\.example\.com/g;
      const enrich = makeEnrichXhrBreadcrumbsForMobileReplay({
        allowUrls: [globalPattern],
        denyUrls: [],
        captureBodies: true,
        requestHeaders: [],
        responseHeaders: [],
      });

      for (let i = 0; i < 3; i += 1) {
        const breadcrumb: Breadcrumb = { category: 'xhr', data: { url: 'https://api.example.com/users' } };
        enrich(breadcrumb, getValidXhrHint());
        expect(breadcrumb.data?.request).toBeDefined();
      }
    });

    it('honours RegExp patterns in allow/deny lists', () => {
      const enrich = makeEnrichXhrBreadcrumbsForMobileReplay({
        allowUrls: [/^https:\/\/api\.example\.com\//],
        denyUrls: [/\/secret/],
        captureBodies: true,
        requestHeaders: [],
        responseHeaders: [],
      });

      const allowed: Breadcrumb = { category: 'xhr', data: { url: 'https://api.example.com/users' } };
      enrich(allowed, getValidXhrHint());
      expect(allowed.data?.request).toBeDefined();

      const denied: Breadcrumb = { category: 'xhr', data: { url: 'https://api.example.com/secret/key' } };
      enrich(denied, getValidXhrHint());
      expect(denied.data?.request).toBeUndefined();
    });

    it('omits bodies when networkCaptureBodies is false but keeps headers', () => {
      const enrich = makeEnrichXhrBreadcrumbsForMobileReplay({
        allowUrls: ['api.example.com'],
        denyUrls: [],
        captureBodies: false,
        requestHeaders: [],
        responseHeaders: [],
      });

      const breadcrumb: Breadcrumb = { category: 'xhr', data: { url: 'https://api.example.com/users' } };
      enrich(breadcrumb, getValidXhrHint());

      expect(breadcrumb.data?.request).toEqual({ headers: { 'content-type': 'application/json' } });
      expect(breadcrumb.data?.response).toEqual(
        expect.objectContaining({
          headers: expect.objectContaining({ 'content-type': 'application/json' }),
        }),
      );
      expect((breadcrumb.data?.response as { body?: string }).body).toBeUndefined();
    });

    it('marks binary request bodies (Blob, ArrayBuffer, typed arrays) as unparseable with a placeholder body so the side survives the native _meta strip', () => {
      const enrich = makeEnrichXhrBreadcrumbsForMobileReplay({
        allowUrls: ['api.example.com'],
        denyUrls: [],
        captureBodies: true,
        requestHeaders: [],
        responseHeaders: [],
      });

      const blobBreadcrumb: Breadcrumb = { category: 'xhr', data: { url: 'https://api.example.com/users' } };
      enrich(blobBreadcrumb, { ...getValidXhrHint(), input: new Blob(['binary']) });
      const blobRequest = blobBreadcrumb.data?.request as { body?: string; _meta?: { warnings: string[] } };
      expect(blobRequest.body).toBe('[UNPARSEABLE_BODY_TYPE]');
      expect(blobRequest._meta?.warnings).toEqual(['UNPARSEABLE_BODY_TYPE']);

      const bufferBreadcrumb: Breadcrumb = { category: 'xhr', data: { url: 'https://api.example.com/users' } };
      enrich(bufferBreadcrumb, { ...getValidXhrHint(), input: new ArrayBuffer(16) });
      const bufferRequest = bufferBreadcrumb.data?.request as { body?: string; _meta?: { warnings: string[] } };
      expect(bufferRequest.body).toBe('[UNPARSEABLE_BODY_TYPE]');
      expect(bufferRequest._meta?.warnings).toEqual(['UNPARSEABLE_BODY_TYPE']);

      const typedArrayBreadcrumb: Breadcrumb = {
        category: 'xhr',
        data: { url: 'https://api.example.com/users' },
      };
      enrich(typedArrayBreadcrumb, { ...getValidXhrHint(), input: new Uint8Array([1, 2, 3]) });
      const typedArrayRequest = typedArrayBreadcrumb.data?.request as {
        body?: string;
        _meta?: { warnings: string[] };
      };
      expect(typedArrayRequest.body).toBe('[UNPARSEABLE_BODY_TYPE]');
      expect(typedArrayRequest._meta?.warnings).toEqual(['UNPARSEABLE_BODY_TYPE']);
    });

    it('stringifies primitive JSON responses (number, boolean) instead of marking them unparseable', () => {
      const enrich = makeEnrichXhrBreadcrumbsForMobileReplay({
        allowUrls: ['api.example.com'],
        denyUrls: [],
        captureBodies: true,
        requestHeaders: [],
        responseHeaders: [],
      });

      const numberBreadcrumb: Breadcrumb = { category: 'xhr', data: { url: 'https://api.example.com/users' } };
      const numberHint = getValidXhrHint();
      numberHint.xhr.response = 42 as unknown as { ok: boolean };
      enrich(numberBreadcrumb, numberHint);
      const numberResponse = numberBreadcrumb.data?.response as { body?: string; _meta?: unknown };
      expect(numberResponse.body).toBe('42');
      expect(numberResponse._meta).toBeUndefined();

      const boolBreadcrumb: Breadcrumb = { category: 'xhr', data: { url: 'https://api.example.com/users' } };
      const boolHint = getValidXhrHint();
      boolHint.xhr.response = true as unknown as { ok: boolean };
      enrich(boolBreadcrumb, boolHint);
      const boolResponse = boolBreadcrumb.data?.response as { body?: string; _meta?: unknown };
      expect(boolResponse.body).toBe('true');
      expect(boolResponse._meta).toBeUndefined();
    });

    it('truncates bodies that exceed the size cap', () => {
      const enrich = makeEnrichXhrBreadcrumbsForMobileReplay({
        allowUrls: ['api.example.com'],
        denyUrls: [],
        captureBodies: true,
        requestHeaders: [],
        responseHeaders: [],
      });

      const bigBody = 'a'.repeat(NETWORK_BODY_MAX_SIZE + 100);
      const breadcrumb: Breadcrumb = { category: 'xhr', data: { url: 'https://api.example.com/users' } };
      enrich(breadcrumb, { ...getValidXhrHint(), input: bigBody });

      const request = breadcrumb.data?.request as { body?: string; _meta?: { warnings: string[] } };
      expect(request.body?.length).toBe(NETWORK_BODY_MAX_SIZE);
      expect(request._meta?.warnings).toEqual(['MAX_BODY_SIZE_EXCEEDED']);
    });

    it('strips deny-listed sensitive headers regardless of configuration', () => {
      const enrich = makeEnrichXhrBreadcrumbsForMobileReplay({
        allowUrls: ['api.example.com'],
        denyUrls: [],
        captureBodies: false,
        requestHeaders: ['authorization', 'cookie'],
        responseHeaders: ['set-cookie'],
      });

      const breadcrumb: Breadcrumb = { category: 'xhr', data: { url: 'https://api.example.com/users' } };
      enrich(breadcrumb, getXhrHintWithSensitiveHeaders());

      const requestHeaders = (breadcrumb.data?.request as { headers?: Record<string, string> }).headers ?? {};
      const responseHeaders = (breadcrumb.data?.response as { headers?: Record<string, string> }).headers ?? {};
      expect(requestHeaders.authorization).toBeUndefined();
      expect(requestHeaders.cookie).toBeUndefined();
      expect(responseHeaders['set-cookie']).toBeUndefined();
      expect(requestHeaders['content-type']).toBe('application/json');
    });

    it('captures additional opt-in headers but not arbitrary headers', () => {
      const enrich = makeEnrichXhrBreadcrumbsForMobileReplay({
        allowUrls: ['api.example.com'],
        denyUrls: [],
        captureBodies: false,
        requestHeaders: ['x-trace-id'],
        responseHeaders: ['x-request-id'],
      });

      const breadcrumb: Breadcrumb = { category: 'xhr', data: { url: 'https://api.example.com/users' } };
      enrich(breadcrumb, getXhrHintWithCustomHeaders());

      const requestHeaders = (breadcrumb.data?.request as { headers?: Record<string, string> }).headers ?? {};
      const responseHeaders = (breadcrumb.data?.response as { headers?: Record<string, string> }).headers ?? {};
      expect(requestHeaders['x-trace-id']).toBe('trace-123');
      expect(requestHeaders['x-unrelated']).toBeUndefined();
      expect(responseHeaders['x-request-id']).toBe('req-456');
      expect(responseHeaders['x-rate-limit']).toBeUndefined();
    });

    it('uses an asynchronously resolved response body from the hint instead of reading the xhr', () => {
      const enrich = makeEnrichXhrBreadcrumbsForMobileReplay(getCaptureAllOptions());

      const breadcrumb: Breadcrumb = { category: 'xhr', data: { url: 'https://api.example.com/users' } };
      const hint = {
        ...getBlobXhrHint(),
        [REPLAY_RESOLVED_RESPONSE_BODY_HINT_KEY]: { body: '{"resolved":true}' },
      };
      enrich(breadcrumb, hint);

      expect((breadcrumb.data?.response as { body?: string }).body).toBe('{"resolved":true}');
    });
  });

  describe('shouldCaptureResponseBodyAsync', () => {
    it('returns true for an allow-listed blob response with a text-like content type', () => {
      const breadcrumb: Breadcrumb = { category: 'xhr', data: { url: 'https://api.example.com/users' } };
      expect(shouldCaptureResponseBodyAsync(breadcrumb, getBlobXhrHint(), getCaptureAllOptions())).toBe(true);
    });

    it('returns true for arraybuffer responses', () => {
      const breadcrumb: Breadcrumb = { category: 'xhr', data: { url: 'https://api.example.com/users' } };
      expect(
        shouldCaptureResponseBodyAsync(breadcrumb, getArrayBufferXhrHint('{"ok":true}'), getCaptureAllOptions()),
      ).toBe(true);
    });

    it('returns false for non-xhr breadcrumbs and missing hints', () => {
      expect(shouldCaptureResponseBodyAsync({ category: 'http' }, getBlobXhrHint(), getCaptureAllOptions())).toBe(
        false,
      );
      expect(shouldCaptureResponseBodyAsync({ category: 'xhr' }, undefined, getCaptureAllOptions())).toBe(false);
    });

    it('returns false for text-like responseTypes that are readable synchronously', () => {
      const breadcrumb: Breadcrumb = { category: 'xhr', data: { url: 'https://api.example.com/users' } };
      expect(shouldCaptureResponseBodyAsync(breadcrumb, getValidXhrHint(), getCaptureAllOptions())).toBe(false);
    });

    it('returns false for binary content types (kept as unparseable)', () => {
      const breadcrumb: Breadcrumb = { category: 'xhr', data: { url: 'https://api.example.com/users' } };
      const hint = getBlobXhrHint({ contentType: 'image/png' });
      expect(shouldCaptureResponseBodyAsync(breadcrumb, hint, getCaptureAllOptions())).toBe(false);
    });

    it('returns false when body capture is disabled or the URL is not allow-listed', () => {
      const breadcrumb: Breadcrumb = { category: 'xhr', data: { url: 'https://api.example.com/users' } };
      expect(
        shouldCaptureResponseBodyAsync(breadcrumb, getBlobXhrHint(), {
          ...getCaptureAllOptions(),
          captureBodies: false,
        }),
      ).toBe(false);
      expect(
        shouldCaptureResponseBodyAsync(breadcrumb, getBlobXhrHint(), {
          ...getCaptureAllOptions(),
          allowUrls: ['api.other.com'],
        }),
      ).toBe(false);
    });

    it('returns false when the hint already carries a resolved body (re-added breadcrumb)', () => {
      const breadcrumb: Breadcrumb = { category: 'xhr', data: { url: 'https://api.example.com/users' } };
      const hint = {
        ...getBlobXhrHint(),
        [REPLAY_RESOLVED_RESPONSE_BODY_HINT_KEY]: { body: '{"ok":true}' },
      };
      expect(shouldCaptureResponseBodyAsync(breadcrumb, hint, getCaptureAllOptions())).toBe(false);
    });
  });

  describe('resolveXhrResponseBody', () => {
    afterEach(() => {
      delete (globalThis as { FileReader?: unknown }).FileReader;
    });

    it('reads a JSON blob response into a text body', async () => {
      installMockFileReader();
      const { xhr } = getBlobXhrHint();
      await expect(resolveXhrResponseBody(xhr as unknown as XMLHttpRequest)).resolves.toEqual({
        body: '{"ok":true}',
      });
    });

    it('truncates blob bodies over the size cap and slices before reading', async () => {
      installMockFileReader();
      const big = 'a'.repeat(NETWORK_BODY_MAX_SIZE + 100);
      const { xhr } = getBlobXhrHint({ body: big });
      const resolved = await resolveXhrResponseBody(xhr as unknown as XMLHttpRequest);
      expect(resolved.body?.length).toBe(NETWORK_BODY_MAX_SIZE);
      expect(resolved._meta?.warnings).toEqual(['MAX_BODY_SIZE_EXCEEDED']);
    });

    it('decodes arraybuffer responses including multi-byte characters', async () => {
      const { xhr } = getArrayBufferXhrHint('{"name":"Пёс 🐕"}');
      await expect(resolveXhrResponseBody(xhr as unknown as XMLHttpRequest)).resolves.toEqual({
        body: '{"name":"Пёс 🐕"}',
      });
    });

    it('resolves to an unparseable marker when the read fails', async () => {
      installMockFileReader({ failWith: new Error('boom') });
      const { xhr } = getBlobXhrHint();
      await expect(resolveXhrResponseBody(xhr as unknown as XMLHttpRequest)).resolves.toEqual({
        _meta: { warnings: ['UNPARSEABLE_BODY_TYPE'] },
      });
    });

    it('resolves to an unparseable marker on timeout', async () => {
      jest.useFakeTimers();
      try {
        installMockFileReader({ neverComplete: true });
        const { xhr } = getBlobXhrHint();
        const promise = resolveXhrResponseBody(xhr as unknown as XMLHttpRequest);
        jest.runAllTimers();
        await expect(promise).resolves.toEqual({ _meta: { warnings: ['UNPARSEABLE_BODY_TYPE'] } });
      } finally {
        jest.useRealTimers();
      }
    });
  });
});

function getCaptureAllOptions(): ResolvedNetworkOptions {
  return {
    allowUrls: ['api.example.com'],
    denyUrls: [],
    captureBodies: true,
    requestHeaders: [],
    responseHeaders: [],
  };
}

function getBlobXhrHint(options: { body?: string; contentType?: string } = {}) {
  const { body = '{"ok":true}', contentType = 'application/json' } = options;
  const blob = new Blob([body]);
  return {
    startTimestamp: 1,
    endTimestamp: 2,
    input: undefined,
    xhr: {
      __sentry_xhr_v3__: {
        method: 'GET',
        url: 'https://api.example.com/users',
        request_headers: { 'content-type': 'application/json' },
      },
      getResponseHeader: (key: string) => (key === 'content-type' ? contentType : null),
      getAllResponseHeaders: () => `content-type: ${contentType}`,
      response: blob as unknown as { ok: boolean },
      responseText: '',
      responseType: 'blob' as const,
    },
  };
}

function getArrayBufferXhrHint(body: string) {
  const buffer = new TextEncoder().encode(body).buffer;
  return {
    startTimestamp: 1,
    endTimestamp: 2,
    input: undefined,
    xhr: {
      __sentry_xhr_v3__: {
        method: 'GET',
        url: 'https://api.example.com/users',
        request_headers: { 'content-type': 'application/json' },
      },
      getResponseHeader: (key: string) => (key === 'content-type' ? 'application/json' : null),
      getAllResponseHeaders: () => 'content-type: application/json',
      response: buffer as unknown as { ok: boolean },
      responseText: '',
      responseType: 'arraybuffer' as const,
    },
  };
}

function installMockFileReader(behavior: { failWith?: Error; neverComplete?: boolean } = {}): void {
  class MockFileReader {
    public result: string | null = null;
    public error: Error | null = null;
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
    public onabort: (() => void) | null = null;

    public readAsText(blob: Blob): void {
      if (behavior.neverComplete) {
        return;
      }
      if (behavior.failWith) {
        this.error = behavior.failWith;
        queueMicrotask(() => this.onerror?.());
        return;
      }
      blob.text().then(
        text => {
          this.result = text;
          this.onload?.();
        },
        (error: Error) => {
          this.error = error;
          this.onerror?.();
        },
      );
    }

    public abort(): void {
      this.onabort?.();
    }
  }
  (globalThis as { FileReader?: unknown }).FileReader = MockFileReader;
}

function getValidXhrHint() {
  const responseHeadersRaw = 'content-type: application/json\r\ncontent-length: 13';
  return {
    startTimestamp: 1,
    endTimestamp: 2,
    input: 'test-input', // 10 bytes
    xhr: {
      __sentry_xhr_v3__: {
        method: 'GET',
        url: 'https://api.example.com/users',
        request_headers: { 'content-type': 'application/json' },
      },
      getResponseHeader: (key: string) => {
        if (key === 'content-length') {
          return '13';
        }
        throw new Error('Invalid key');
      },
      getAllResponseHeaders: () => responseHeadersRaw,
      response: { ok: true }, // serialized 'test-response' is 13 bytes
      responseText: '{"ok":true}',
      responseType: 'json' as const,
    },
  };
}

function getXhrHintWithSensitiveHeaders() {
  const responseHeadersRaw = 'content-type: application/json\r\nset-cookie: session=abc\r\ncontent-length: 13';
  return {
    startTimestamp: 1,
    endTimestamp: 2,
    input: 'test-input',
    xhr: {
      __sentry_xhr_v3__: {
        method: 'GET',
        url: 'https://api.example.com/users',
        request_headers: {
          'content-type': 'application/json',
          Authorization: 'Bearer secret',
          Cookie: 'session=abc',
        },
      },
      getResponseHeader: (_key: string) => null,
      getAllResponseHeaders: () => responseHeadersRaw,
      response: 'test-response',
      responseText: 'test-response',
      responseType: 'text' as const,
    },
  };
}

function getXhrHintWithCustomHeaders() {
  const responseHeadersRaw = 'content-type: application/json\r\nx-request-id: req-456\r\nx-rate-limit: 100';
  return {
    startTimestamp: 1,
    endTimestamp: 2,
    input: 'test-input',
    xhr: {
      __sentry_xhr_v3__: {
        method: 'GET',
        url: 'https://api.example.com/users',
        request_headers: {
          'content-type': 'application/json',
          'X-Trace-Id': 'trace-123',
          'X-Unrelated': 'whatever',
        },
      },
      getResponseHeader: (_key: string) => null,
      getAllResponseHeaders: () => responseHeadersRaw,
      response: 'test-response',
      responseText: 'test-response',
      responseType: 'text' as const,
    },
  };
}
