import type { Breadcrumb } from '@sentry/core';

import { NETWORK_BODY_MAX_SIZE } from '../../src/js/replay/networkUtils';
import {
  enrichXhrBreadcrumbsForMobileReplay,
  makeEnrichXhrBreadcrumbsForMobileReplay,
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

    it('marks Blob and ArrayBuffer request bodies as unparseable instead of stringifying to {}', () => {
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
      expect(blobRequest.body).toBeUndefined();
      expect(blobRequest._meta?.warnings).toEqual(['UNPARSEABLE_BODY_TYPE']);

      const bufferBreadcrumb: Breadcrumb = { category: 'xhr', data: { url: 'https://api.example.com/users' } };
      enrich(bufferBreadcrumb, { ...getValidXhrHint(), input: new ArrayBuffer(16) });
      const bufferRequest = bufferBreadcrumb.data?.request as { body?: string; _meta?: { warnings: string[] } };
      expect(bufferRequest.body).toBeUndefined();
      expect(bufferRequest._meta?.warnings).toEqual(['UNPARSEABLE_BODY_TYPE']);
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
  });
});

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
