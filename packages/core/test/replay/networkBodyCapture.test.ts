import type { Breadcrumb, BreadcrumbHint } from '@sentry/core';

import * as SentryCore from '@sentry/core';

import { mobileReplayIntegration } from '../../src/js/replay/mobilereplay';
import { enableSyncToNative } from '../../src/js/scopeSync';
import * as environment from '../../src/js/utils/environment';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

jest.mock('../../src/js/wrapper', () => jest.requireActual('../mockWrapper'));

import { NATIVE } from '../mockWrapper';

jest.mock('../../src/js/wrapper');

/**
 * End-to-end coverage of the async response body capture: real `@sentry/core`
 * breadcrumb pipeline, real scope sync patch, mocked native bridge.
 *
 * This is what guards the object-identity assumption the deferral relies on —
 * the breadcrumb our `beforeBreadcrumb` returns must be the very object handed
 * to `scope.addBreadcrumb`.
 */
describe('Mobile Replay async network body capture (end to end)', () => {
  const flushMicrotasks = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

  const getBlobXhrHint = (body = '{"ok":true}', contentType = 'application/json'): BreadcrumbHint =>
    ({
      startTimestamp: 1000,
      endTimestamp: 1200,
      xhr: {
        __sentry_xhr_v3__: {
          method: 'GET',
          url: 'https://api.example.com/users',
          request_headers: { 'content-type': 'application/json' },
        },
        getResponseHeader: (key: string) => (key === 'content-type' ? contentType : null),
        getAllResponseHeaders: () => `content-type: ${contentType}`,
        response: new Blob([body]),
        responseType: 'blob',
      },
    }) as unknown as BreadcrumbHint;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(environment, 'isExpoGo').mockReturnValue(false);
    jest.spyOn(environment, 'notMobileOs').mockReturnValue(false);
    installFileReader();

    const client = new TestClient(getDefaultTestClientOptions());
    SentryCore.setCurrentClient(client);
    SentryCore.getIsolationScope().clearBreadcrumbs();
    enableSyncToNative(SentryCore.getIsolationScope());

    mobileReplayIntegration({
      networkDetailAllowUrls: ['api.example.com'],
    }).setup?.(client);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (globalThis as { FileReader?: unknown }).FileReader;
  });

  it('keeps the breadcrumb on the scope immediately and syncs to native only once the body resolved', async () => {
    const breadcrumb: Breadcrumb = { category: 'xhr', data: { url: 'https://api.example.com/users' } };

    SentryCore.addBreadcrumb(breadcrumb, getBlobXhrHint());

    // Synchronously: on the scope (so error events keep it), not yet on native.
    const onScope = SentryCore.getIsolationScope().getLastBreadcrumb();
    expect(onScope).toBeDefined();
    expect(onScope?.data?.url).toBe('https://api.example.com/users');
    expect(NATIVE.addBreadcrumb).not.toHaveBeenCalled();

    await flushMicrotasks();

    expect(NATIVE.addBreadcrumb).toHaveBeenCalledTimes(1);
    const synced = (NATIVE.addBreadcrumb as jest.Mock).mock.calls[0][0] as Breadcrumb;
    expect(synced.data?.response).toMatchObject({ body: '{"ok":true}' });
    expect(synced.data?.request).toMatchObject({ headers: { 'content-type': 'application/json' } });
    expect(synced.timestamp).toBe(onScope?.timestamp);
  });

  it('syncs synchronously and does not defer for a text response', async () => {
    const textHint = {
      startTimestamp: 1000,
      endTimestamp: 1200,
      xhr: {
        __sentry_xhr_v3__: { method: 'GET', url: 'https://api.example.com/users', request_headers: {} },
        getResponseHeader: () => null,
        getAllResponseHeaders: () => 'content-type: application/json',
        response: '{"ok":true}',
        responseText: '{"ok":true}',
        responseType: 'text',
      },
    } as unknown as BreadcrumbHint;

    SentryCore.addBreadcrumb({ category: 'xhr', data: { url: 'https://api.example.com/users' } }, textHint);

    expect(NATIVE.addBreadcrumb).toHaveBeenCalledTimes(1);

    await flushMicrotasks();
    expect(NATIVE.addBreadcrumb).toHaveBeenCalledTimes(1);
  });

  it('syncs synchronously for a genuinely binary response, keeping the unparseable marker', async () => {
    SentryCore.addBreadcrumb(
      { category: 'xhr', data: { url: 'https://api.example.com/users' } },
      getBlobXhrHint('\u0000\u0001', 'image/png'),
    );

    expect(NATIVE.addBreadcrumb).toHaveBeenCalledTimes(1);
    const synced = (NATIVE.addBreadcrumb as jest.Mock).mock.calls[0][0] as Breadcrumb;
    expect(synced.data?.response).toMatchObject({ body: '[UNPARSEABLE_BODY_TYPE]' });

    await flushMicrotasks();
    expect(NATIVE.addBreadcrumb).toHaveBeenCalledTimes(1);
  });

  it('still syncs the breadcrumb to native when the body read fails', async () => {
    installFileReader({ fail: true });

    SentryCore.addBreadcrumb({ category: 'xhr', data: { url: 'https://api.example.com/users' } }, getBlobXhrHint());

    expect(NATIVE.addBreadcrumb).not.toHaveBeenCalled();

    await flushMicrotasks();

    expect(NATIVE.addBreadcrumb).toHaveBeenCalledTimes(1);
    const synced = (NATIVE.addBreadcrumb as jest.Mock).mock.calls[0][0] as Breadcrumb;
    expect(synced.data?.response).toMatchObject({ body: '[UNPARSEABLE_BODY_TYPE]' });
  });

  it('does not sync to native for a URL that is not allow-listed', async () => {
    SentryCore.addBreadcrumb({ category: 'xhr', data: { url: 'https://other.example.org/users' } }, getBlobXhrHint());

    // Not allow-listed, so no async read — synced right away, without details.
    expect(NATIVE.addBreadcrumb).toHaveBeenCalledTimes(1);
    const synced = (NATIVE.addBreadcrumb as jest.Mock).mock.calls[0][0] as Breadcrumb;
    expect(synced.data?.response).toBeUndefined();

    await flushMicrotasks();
    expect(NATIVE.addBreadcrumb).toHaveBeenCalledTimes(1);
  });
});

function installFileReader(behavior: { fail?: boolean } = {}): void {
  class MockFileReader {
    public result: string | null = null;
    public error: Error | null = null;
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
    public onabort: (() => void) | null = null;

    public readAsText(blob: Blob): void {
      if (behavior.fail) {
        this.error = new Error('read failed');
        queueMicrotask(() => this.onerror?.());
        return;
      }
      blob.text().then(text => {
        this.result = text;
        this.onload?.();
      });
    }

    public abort(): void {
      this.onabort?.();
    }
  }
  (globalThis as { FileReader?: unknown }).FileReader = MockFileReader;
}
