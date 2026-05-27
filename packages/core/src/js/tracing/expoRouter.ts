import { addBreadcrumb, SPAN_STATUS_ERROR, SPAN_STATUS_OK, startInactiveSpan } from '@sentry/core';

import { SPAN_ORIGIN_AUTO_EXPO_ROUTER_NAVIGATION, SPAN_ORIGIN_AUTO_EXPO_ROUTER_PREFETCH } from './origin';
import { setPendingExpoRouterNavigation } from './pendingExpoRouterNavigation';

type ExpoRouterHref = string | { pathname?: string; params?: Record<string, unknown> };

/**
 * Type definition for Expo Router's router object.
 */
export interface ExpoRouter {
  prefetch?: (href: ExpoRouterHref) => void | Promise<void>;
  push?: (...args: unknown[]) => void;
  replace?: (...args: unknown[]) => void;
  navigate?: (...args: unknown[]) => void;
  back?: () => void;
  dismiss?: (count?: number) => void;
}

type NavigationMethod = 'push' | 'replace' | 'navigate' | 'back' | 'dismiss';

interface ParsedHref {
  href?: unknown;
  routeName: string;
  pathname?: string;
  params?: Record<string, unknown>;
}

/**
 * Wraps Expo Router methods to add automated performance monitoring and breadcrumbs.
 *
 * Currently wraps:
 *  - `prefetch` — wraps the call in a `navigation.prefetch` span.
 *  - `push` / `replace` / `navigate` / `back` / `dismiss` — adds a navigation
 *    breadcrumb, wraps the call in a short-lived span that mirrors prefetch's
 *    error/status handling, and tags the subsequent idle navigation transaction
 *    with the initiating `navigation.method` so the resulting span can be
 *    attributed back to the call site.
 *
 * Safe to call repeatedly — guarded by a single `__sentryWrapped` flag.
 *
 * @param router - The Expo Router instance from `useRouter()` hook
 * @returns The same router instance with instrumented methods
 */
export function wrapExpoRouter<T extends ExpoRouter>(router: T): T {
  if (!router) {
    return router;
  }

  const wrappedRouter = router as T & { __sentryWrapped?: boolean };
  if (wrappedRouter.__sentryWrapped) {
    return router;
  }

  if (router.prefetch) {
    wrapPrefetch(router);
  }

  if (router.push) {
    router.push = wrapNavigationMethod(router, 'push', router.push.bind(router));
  }
  if (router.replace) {
    router.replace = wrapNavigationMethod(router, 'replace', router.replace.bind(router));
  }
  if (router.navigate) {
    router.navigate = wrapNavigationMethod(router, 'navigate', router.navigate.bind(router));
  }
  if (router.back) {
    router.back = wrapNavigationMethod(router, 'back', router.back.bind(router)) as NonNullable<T['back']>;
  }
  if (router.dismiss) {
    const originalDismiss = router.dismiss.bind(router) as (...args: unknown[]) => unknown;
    router.dismiss = wrapNavigationMethod(router, 'dismiss', originalDismiss) as NonNullable<T['dismiss']>;
  }

  wrappedRouter.__sentryWrapped = true;
  return router;
}

function wrapPrefetch<T extends ExpoRouter>(router: T): void {
  const originalPrefetch = router.prefetch!.bind(router);

  router.prefetch = ((href: ExpoRouterHref) => {
    const { routeName } = parseHref(href);

    const span = startInactiveSpan({
      op: 'navigation.prefetch',
      name: `Prefetch ${routeName}`,
      attributes: {
        'sentry.origin': SPAN_ORIGIN_AUTO_EXPO_ROUTER_PREFETCH,
        'route.href': typeof href === 'string' ? href : JSON.stringify(href),
        'route.name': routeName,
      },
    });

    try {
      const result = originalPrefetch(href);

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
      }

      span?.setStatus({ code: SPAN_STATUS_OK });
      span?.end();
      return result;
    } catch (error) {
      span?.setStatus({ code: SPAN_STATUS_ERROR, message: String(error) });
      span?.end();
      throw error;
    }
  }) as NonNullable<T['prefetch']>;
}

function wrapNavigationMethod(
  router: ExpoRouter,
  method: NavigationMethod,
  original: (...args: unknown[]) => unknown,
): (...args: unknown[]) => unknown {
  return (...args: unknown[]) => {
    const parsed = parseMethodArgs(method, args);

    addBreadcrumb({
      category: 'navigation',
      type: 'navigation',
      message: `Expo Router ${method}${parsed.pathname ? ` to ${parsed.pathname}` : ''}`,
      data: {
        method,
        ...(parsed.href !== undefined ? { href: serializeHref(parsed.href) } : undefined),
        ...(parsed.pathname ? { pathname: parsed.pathname } : undefined),
        ...(parsed.params ? { params: parsed.params } : undefined),
      },
    });

    setPendingExpoRouterNavigation({
      method,
      href: parsed.href,
      pathname: parsed.pathname,
      params: parsed.params,
    });

    const span = startInactiveSpan({
      op: `navigation.${method}`,
      name: `Navigation ${method}${parsed.pathname ? ` to ${parsed.pathname}` : ''}`,
      attributes: {
        'sentry.origin': SPAN_ORIGIN_AUTO_EXPO_ROUTER_NAVIGATION,
        'navigation.method': method,
        ...(parsed.href !== undefined ? { 'route.href': serializeHref(parsed.href) } : undefined),
        ...(parsed.routeName ? { 'route.name': parsed.routeName } : undefined),
      },
    });

    try {
      const result = original.apply(router, args);
      span?.setStatus({ code: SPAN_STATUS_OK });
      span?.end();
      return result;
    } catch (error) {
      span?.setStatus({ code: SPAN_STATUS_ERROR, message: String(error) });
      span?.end();
      throw error;
    }
  };
}

function parseMethodArgs(method: NavigationMethod, args: unknown[]): ParsedHref {
  if (method === 'back' || method === 'dismiss') {
    return { routeName: method };
  }
  return parseHref(args[0] as ExpoRouterHref | undefined);
}

function parseHref(href: ExpoRouterHref | undefined): ParsedHref {
  if (typeof href === 'string') {
    return { href, routeName: href, pathname: href };
  }
  if (href && typeof href === 'object') {
    const pathname = typeof href.pathname === 'string' ? href.pathname : undefined;
    return {
      href,
      routeName: pathname ?? 'unknown',
      pathname,
      params: href.params,
    };
  }
  return { routeName: 'unknown' };
}

function serializeHref(href: unknown): string {
  return typeof href === 'string' ? href : JSON.stringify(href);
}
