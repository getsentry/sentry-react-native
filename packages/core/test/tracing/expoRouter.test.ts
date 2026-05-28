import { SPAN_STATUS_ERROR, SPAN_STATUS_OK } from '@sentry/core';

import { type ExpoRouter, wrapExpoRouter } from '../../src/js/tracing';
import {
  SPAN_ORIGIN_AUTO_EXPO_ROUTER_NAVIGATION,
  SPAN_ORIGIN_AUTO_EXPO_ROUTER_PREFETCH,
} from '../../src/js/tracing/origin';
import {
  clearPendingExpoRouterNavigation,
  consumePendingExpoRouterNavigation,
} from '../../src/js/tracing/pendingExpoRouterNavigation';

const mockStartInactiveSpan = jest.fn();
const mockAddBreadcrumb = jest.fn();
let mockSendDefaultPii = false;

jest.mock('@sentry/core', () => {
  const actual = jest.requireActual('@sentry/core');
  return {
    ...actual,
    startInactiveSpan: (...args: unknown[]) => mockStartInactiveSpan(...args),
    addBreadcrumb: (...args: unknown[]) => mockAddBreadcrumb(...args),
    getClient: () => ({ getOptions: () => ({ sendDefaultPii: mockSendDefaultPii }) }),
  };
});

describe('wrapExpoRouter', () => {
  let mockSpan: {
    setStatus: jest.Mock;
    end: jest.Mock;
    setAttribute: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSpan = {
      setStatus: jest.fn(),
      end: jest.fn(),
      setAttribute: jest.fn(),
    };
    mockStartInactiveSpan.mockReturnValue(mockSpan);
    mockSendDefaultPii = false;
    clearPendingExpoRouterNavigation();
  });

  it('returns the router unchanged if router is null or undefined', () => {
    expect(wrapExpoRouter(null as unknown as ExpoRouter)).toBeNull();
    expect(wrapExpoRouter(undefined as unknown as ExpoRouter)).toBeUndefined();
  });

  it('returns the router unchanged if prefetch method does not exist', () => {
    const router = { push: jest.fn() } as unknown as ExpoRouter;
    const wrapped = wrapExpoRouter(router);
    expect(wrapped).toBe(router);
  });

  it('wraps prefetch method and creates a span with string href (no PII attributes by default)', () => {
    const mockPrefetch = jest.fn();
    const router = { prefetch: mockPrefetch } as ExpoRouter;

    const wrapped = wrapExpoRouter(router);
    wrapped.prefetch?.('/details/123');

    expect(mockStartInactiveSpan).toHaveBeenCalledWith({
      op: 'navigation.prefetch',
      name: 'Prefetch /details/123',
      attributes: {
        'sentry.origin': SPAN_ORIGIN_AUTO_EXPO_ROUTER_PREFETCH,
        'route.name': '/details/123',
      },
    });

    expect(mockPrefetch).toHaveBeenCalledWith('/details/123');
    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SPAN_STATUS_OK });
    expect(mockSpan.end).toHaveBeenCalled();
  });

  it('includes `route.href` on prefetch span only when sendDefaultPii is enabled', () => {
    mockSendDefaultPii = true;
    const mockPrefetch = jest.fn();
    const router = { prefetch: mockPrefetch } as ExpoRouter;
    const href = { pathname: '/profile', params: { id: '456' } };

    const wrapped = wrapExpoRouter(router);
    wrapped.prefetch?.(href);

    expect(mockStartInactiveSpan).toHaveBeenCalledWith({
      op: 'navigation.prefetch',
      name: 'Prefetch /profile',
      attributes: {
        'sentry.origin': SPAN_ORIGIN_AUTO_EXPO_ROUTER_PREFETCH,
        'route.name': '/profile',
        'route.href': JSON.stringify(href),
      },
    });

    expect(mockPrefetch).toHaveBeenCalledWith(href);
    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SPAN_STATUS_OK });
    expect(mockSpan.end).toHaveBeenCalled();
  });

  it('handles object href without pathname', () => {
    const mockPrefetch = jest.fn();
    const router = { prefetch: mockPrefetch } as ExpoRouter;
    const href = { params: { id: '789' } };

    const wrapped = wrapExpoRouter(router);
    wrapped.prefetch?.(href);

    expect(mockStartInactiveSpan).toHaveBeenCalledWith({
      op: 'navigation.prefetch',
      name: 'Prefetch unknown',
      attributes: {
        'sentry.origin': SPAN_ORIGIN_AUTO_EXPO_ROUTER_PREFETCH,
        'route.name': 'unknown',
      },
    });
  });

  it('handles successful async prefetch', async () => {
    const mockPrefetch = jest.fn().mockResolvedValue(undefined);
    const router = { prefetch: mockPrefetch } as ExpoRouter;

    const wrapped = wrapExpoRouter(router);
    await wrapped.prefetch?.('/async-route');

    expect(mockPrefetch).toHaveBeenCalledWith('/async-route');
    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SPAN_STATUS_OK });
    expect(mockSpan.end).toHaveBeenCalled();
  });

  it('handles failed async prefetch', async () => {
    const error = new Error('Prefetch failed');
    const mockPrefetch = jest.fn().mockRejectedValue(error);
    const router = { prefetch: mockPrefetch } as ExpoRouter;

    const wrapped = wrapExpoRouter(router);

    await expect(wrapped.prefetch?.('/failing-route')).rejects.toThrow('Prefetch failed');

    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: SPAN_STATUS_ERROR,
      message: 'Error: Prefetch failed',
    });
    expect(mockSpan.end).toHaveBeenCalled();
  });

  it('handles synchronous errors', () => {
    const error = new Error('Sync prefetch error');
    const mockPrefetch = jest.fn().mockImplementation(() => {
      throw error;
    });
    const router = { prefetch: mockPrefetch } as ExpoRouter;

    const wrapped = wrapExpoRouter(router);

    expect(() => wrapped.prefetch?.('/error-route')).toThrow('Sync prefetch error');

    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: SPAN_STATUS_ERROR,
      message: 'Error: Sync prefetch error',
    });
    expect(mockSpan.end).toHaveBeenCalled();
  });

  it('does not double-wrap the same router', () => {
    const mockPrefetch = jest.fn();
    const router = { prefetch: mockPrefetch } as ExpoRouter;

    const wrapped1 = wrapExpoRouter(router);
    const wrapped2 = wrapExpoRouter(wrapped1);

    expect(wrapped1).toBe(wrapped2);

    wrapped2.prefetch?.('/test');

    // Should only be called once despite double wrapping
    expect(mockStartInactiveSpan).toHaveBeenCalledTimes(1);
  });

  it('still wraps prefetch when other methods are absent', () => {
    const mockPrefetch = jest.fn();
    const router = { prefetch: mockPrefetch } as ExpoRouter;

    const wrapped = wrapExpoRouter(router);
    expect(wrapped.prefetch).not.toBe(mockPrefetch);
  });

  describe.each(['push', 'replace', 'navigate'] as const)('wraps %s', method => {
    it(`creates a PII-free span and breadcrumb with string href for ${method}`, () => {
      const original = jest.fn();
      const router = { [method]: original } as unknown as ExpoRouter;

      const wrapped = wrapExpoRouter(router);
      wrapped[method]?.('/details/123');

      expect(original).toHaveBeenCalledWith('/details/123');
      expect(mockStartInactiveSpan).toHaveBeenCalledWith({
        op: `navigation.${method}`,
        name: `Navigation ${method} to /details/123`,
        attributes: {
          'sentry.origin': SPAN_ORIGIN_AUTO_EXPO_ROUTER_NAVIGATION,
          'navigation.method': method,
          'route.name': '/details/123',
        },
      });
      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        category: 'navigation',
        type: 'navigation',
        message: `Expo Router ${method} to /details/123`,
        data: {
          method,
          pathname: '/details/123',
        },
      });
      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SPAN_STATUS_OK });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it(`creates a PII-free span and breadcrumb with object href for ${method}`, () => {
      const original = jest.fn();
      const router = { [method]: original } as unknown as ExpoRouter;
      const href = { pathname: '/profile', params: { id: '456' } };

      const wrapped = wrapExpoRouter(router);
      wrapped[method]?.(href);

      expect(original).toHaveBeenCalledWith(href);
      expect(mockStartInactiveSpan).toHaveBeenCalledWith({
        op: `navigation.${method}`,
        name: `Navigation ${method} to /profile`,
        attributes: {
          'sentry.origin': SPAN_ORIGIN_AUTO_EXPO_ROUTER_NAVIGATION,
          'navigation.method': method,
          'route.name': '/profile',
        },
      });
      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        category: 'navigation',
        type: 'navigation',
        message: `Expo Router ${method} to /profile`,
        data: {
          method,
          pathname: '/profile',
        },
      });
    });

    it(`includes href and params in ${method} span/breadcrumb only when sendDefaultPii is enabled`, () => {
      mockSendDefaultPii = true;
      const original = jest.fn();
      const router = { [method]: original } as unknown as ExpoRouter;
      const href = { pathname: '/profile', params: { id: '456' } };

      wrapExpoRouter(router)[method]?.(href);

      expect(mockStartInactiveSpan).toHaveBeenCalledWith({
        op: `navigation.${method}`,
        name: `Navigation ${method} to /profile`,
        attributes: {
          'sentry.origin': SPAN_ORIGIN_AUTO_EXPO_ROUTER_NAVIGATION,
          'navigation.method': method,
          'route.name': '/profile',
          'route.href': JSON.stringify(href),
        },
      });
      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        category: 'navigation',
        type: 'navigation',
        message: `Expo Router ${method} to /profile`,
        data: {
          method,
          pathname: '/profile',
          href: JSON.stringify(href),
          params: { id: '456' },
        },
      });
    });

    it(`sets pending navigation so it can be consumed for ${method}`, () => {
      const original = jest.fn();
      const router = { [method]: original } as unknown as ExpoRouter;

      wrapExpoRouter(router)[method]?.({ pathname: '/profile', params: { id: '7' } });

      const pending = consumePendingExpoRouterNavigation();
      expect(pending).toEqual({
        method,
        href: { pathname: '/profile', params: { id: '7' } },
        pathname: '/profile',
        params: { id: '7' },
      });
      // consumed exactly once
      expect(consumePendingExpoRouterNavigation()).toBeUndefined();
    });

    it(`reports errors via SPAN_STATUS_ERROR for ${method}`, () => {
      const error = new Error(`${method} failed`);
      const original = jest.fn(() => {
        throw error;
      });
      const router = { [method]: original } as unknown as ExpoRouter;

      expect(() => wrapExpoRouter(router)[method]?.('/x')).toThrow(`${method} failed`);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SPAN_STATUS_ERROR,
        message: `Error: ${method} failed`,
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });
  });

  it('wraps back() with no args', () => {
    const mockBack = jest.fn();
    const router = { back: mockBack } as unknown as ExpoRouter;

    wrapExpoRouter(router).back?.();

    expect(mockBack).toHaveBeenCalledWith();
    expect(mockStartInactiveSpan).toHaveBeenCalledWith({
      op: 'navigation.back',
      name: 'Navigation back',
      attributes: {
        'sentry.origin': SPAN_ORIGIN_AUTO_EXPO_ROUTER_NAVIGATION,
        'navigation.method': 'back',
        'route.name': 'back',
      },
    });
    expect(mockAddBreadcrumb).toHaveBeenCalledWith({
      category: 'navigation',
      type: 'navigation',
      message: 'Expo Router back',
      data: { method: 'back' },
    });
    expect(consumePendingExpoRouterNavigation()).toEqual({ method: 'back' });
  });

  it('wraps dismiss() and forwards optional count', () => {
    const mockDismiss = jest.fn();
    const router = { dismiss: mockDismiss } as unknown as ExpoRouter;

    wrapExpoRouter(router).dismiss?.(2);

    expect(mockDismiss).toHaveBeenCalledWith(2);
    expect(mockStartInactiveSpan).toHaveBeenCalledWith({
      op: 'navigation.dismiss',
      name: 'Navigation dismiss',
      attributes: {
        'sentry.origin': SPAN_ORIGIN_AUTO_EXPO_ROUTER_NAVIGATION,
        'navigation.method': 'dismiss',
        'route.name': 'dismiss',
      },
    });
    expect(mockAddBreadcrumb).toHaveBeenCalledWith({
      category: 'navigation',
      type: 'navigation',
      message: 'Expo Router dismiss',
      data: { method: 'dismiss' },
    });
  });

  it('does not double-wrap navigation methods', () => {
    const mockPush = jest.fn();
    const router = { push: mockPush } as unknown as ExpoRouter;

    const wrapped1 = wrapExpoRouter(router);
    const wrappedPushAfterFirst = wrapped1.push;
    const wrapped2 = wrapExpoRouter(wrapped1);

    expect(wrapped2.push).toBe(wrappedPushAfterFirst);

    wrapped2.push?.('/x');
    expect(mockStartInactiveSpan).toHaveBeenCalledTimes(1);
  });

  it('returns the router unchanged if no known methods exist', () => {
    const router = { somethingElse: jest.fn() } as unknown as ExpoRouter;
    const wrapped = wrapExpoRouter(router);
    expect(wrapped).toBe(router);
  });

  it('binds prefetch method correctly to maintain context', () => {
    const routerContext = { data: 'test-context' };
    const mockPrefetch = jest.fn(function (this: typeof routerContext) {
      expect(this).toBe(routerContext);
    });

    const router = {
      prefetch: mockPrefetch.bind(routerContext),
    } as unknown as ExpoRouter;

    const wrapped = wrapExpoRouter(router);
    wrapped.prefetch?.('/test');

    expect(mockPrefetch).toHaveBeenCalled();
  });
});
