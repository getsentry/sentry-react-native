import { SPAN_STATUS_ERROR, SPAN_STATUS_OK, startInactiveSpan } from '@sentry/core';

/**
 * Type definition for Expo Router's router object
 */
export interface ExpoRouter {
  prefetch?: (href: string | { pathname?: string; params?: Record<string, unknown> }) => void | Promise<void>;
  // Other router methods can be added here if needed
  push?: (...args: unknown[]) => void;
  replace?: (...args: unknown[]) => void;
  back?: () => void;
  navigate?: (...args: unknown[]) => void;
}

/**
 * Wraps Expo Router. It currently only does one thing: extends prefetch() method
 * to add automated performance monitoring.
 *
 * This function instruments the `prefetch` method of an Expo Router instance
 * to create performance spans that measure how long route prefetching takes.
 *
 * @param router - The Expo Router instance from `useRouter()` hook
 * @returns The same router instance with an instrumented prefetch method
 */
export function wrapExpoRouter<T extends ExpoRouter>(router: T): T {
  if (!router?.prefetch) {
    return router;
  }

  // Check if already wrapped to avoid double-wrapping
  if ((router as T & { __sentryPrefetchWrapped?: boolean }).__sentryPrefetchWrapped) {
    return router;
  }

  const originalPrefetch = router.prefetch.bind(router);

  router.prefetch = ((href: Parameters<NonNullable<ExpoRouter['prefetch']>>[0]) => {
    // Extract route name from href for better span naming
    let routeName = 'unknown';
    if (typeof href === 'string') {
      routeName = href;
    } else if (href && typeof href === 'object' && 'pathname' in href && href.pathname) {
      routeName = href.pathname;
    }

    const span = startInactiveSpan({
      op: 'navigation.prefetch',
      name: `Prefetch ${routeName}`,
      attributes: {
        'route.href': typeof href === 'string' ? href : JSON.stringify(href),
        'route.name': routeName,
      },
    });

    try {
      const result = originalPrefetch(href);

      // Handle both promise and synchronous returns
      if (result && typeof result === 'object' && 'then' in result && typeof result.then === 'function') {
        return result
          .then(res => {
            span?.setStatus({ code: SPAN_STATUS_OK });
            span?.end();
            return res;
          })
          .catch((error: unknown) => {
            span?.setStatus({ code: SPAN_STATUS_ERROR, message: String(error) });
            span?.end();
            throw error;
          });
      } else {
        // Synchronous completion
        span?.setStatus({ code: SPAN_STATUS_OK });
        span?.end();
        return result;
      }
    } catch (error) {
      span?.setStatus({ code: SPAN_STATUS_ERROR, message: String(error) });
      span?.end();
      throw error;
    }
  }) as NonNullable<T['prefetch']>;

  // Mark as wrapped to prevent double-wrapping
  (router as T & { __sentryPrefetchWrapped?: boolean }).__sentryPrefetchWrapped = true;

  return router;
}
