import { SPAN_STATUS_ERROR, SPAN_STATUS_OK } from '@sentry/core';
import { type ExpoRouter, wrapExpoRouter } from '../../src/js/tracing';
import { SPAN_ORIGIN_AUTO_EXPO_ROUTER_PREFETCH } from '../../src/js/tracing/origin';

const mockStartInactiveSpan = jest.fn();

jest.mock('@sentry/core', () => {
  const actual = jest.requireActual('@sentry/core');
  return {
    ...actual,
    startInactiveSpan: (...args: unknown[]) => mockStartInactiveSpan(...args),
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

  it('wraps prefetch method and creates a span with string href', () => {
    const mockPrefetch = jest.fn();
    const router = { prefetch: mockPrefetch } as ExpoRouter;

    const wrapped = wrapExpoRouter(router);
    wrapped.prefetch?.('/details/123');

    expect(mockStartInactiveSpan).toHaveBeenCalledWith({
      op: 'navigation.prefetch',
      name: 'Prefetch /details/123',
      origin: 'auto.navigation.react_navigation',
      attributes: {
        'sentry.origin': SPAN_ORIGIN_AUTO_EXPO_ROUTER_PREFETCH,
        'route.href': '/details/123',
        'route.name': '/details/123',
      },
    });

    expect(mockPrefetch).toHaveBeenCalledWith('/details/123');
    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SPAN_STATUS_OK });
    expect(mockSpan.end).toHaveBeenCalled();
  });

  it('wraps prefetch method and creates a span with object href', () => {
    const mockPrefetch = jest.fn();
    const router = { prefetch: mockPrefetch } as ExpoRouter;
    const href = { pathname: '/profile', params: { id: '456' } };

    const wrapped = wrapExpoRouter(router);
    wrapped.prefetch?.(href);

    expect(mockStartInactiveSpan).toHaveBeenCalledWith({
      op: 'navigation.prefetch',
      name: 'Prefetch /profile',
      origin: 'auto.navigation.react_navigation',
      attributes: {
        'sentry.origin': SPAN_ORIGIN_AUTO_EXPO_ROUTER_PREFETCH,
        'route.href': JSON.stringify(href),
        'route.name': '/profile',
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
      origin: 'auto.navigation.react_navigation',
      attributes: {
        'sentry.origin': SPAN_ORIGIN_AUTO_EXPO_ROUTER_PREFETCH,
        'route.href': JSON.stringify(href),
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

  it('preserves other router methods', () => {
    const mockPush = jest.fn();
    const mockBack = jest.fn();
    const mockPrefetch = jest.fn();
    const router = {
      prefetch: mockPrefetch,
      push: mockPush,
      back: mockBack,
    } as unknown as ExpoRouter;

    const wrapped = wrapExpoRouter(router);

    expect(wrapped.push).toBe(mockPush);
    expect(wrapped.back).toBe(mockBack);
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
