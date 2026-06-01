import { addBreadcrumb, getClient, SPAN_STATUS_ERROR, SPAN_STATUS_OK, startInactiveSpan } from '@sentry/core';

import { SPAN_ORIGIN_AUTO_EXPO_ROUTER_NAVIGATION, SPAN_ORIGIN_AUTO_EXPO_ROUTER_PREFETCH } from './origin';
import { clearPendingExpoRouterNavigation, setPendingExpoRouterNavigation } from './pendingExpoRouterNavigation';

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
  /** A label used for span/transaction naming. May be PII when {@link concretePathname} is true. */
  routeName: string;
  /** Pathname extracted from the href, if any. May be PII when {@link concretePathname} is true. */
  pathname?: string;
  params?: Record<string, unknown>;
  /**
   * Whether `pathname` / `routeName` came from a concrete string href (e.g. `/users/42`)
   * rather than a templated object href (e.g. `{ pathname: '/users/[id]' }`).
   *
   * Concrete pathnames can contain user identifiers and must be gated behind
   * `sendDefaultPii`. Templated pathnames are structural and safe.
   */
  concretePathname: boolean;
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
    const parsed = parseHref(href);
    const sendPii = isSendDefaultPiiEnabled();
    // For concrete string hrefs (e.g. `/users/42`), `routeName` may carry
    // user identifiers — gate it behind `sendDefaultPii`. For templated
    // object hrefs (e.g. `{ pathname: '/users/[id]' }`) it is structural.
    const safeRouteName = parsed.concretePathname && !sendPii ? 'unknown' : parsed.routeName;

    const span = startInactiveSpan({
      op: 'navigation.prefetch',
      name: `Prefetch ${safeRouteName}`,
      attributes: {
        'sentry.origin': SPAN_ORIGIN_AUTO_EXPO_ROUTER_PREFETCH,
        'route.name': safeRouteName,
        // `route.href` may contain dynamic segment values (e.g. `/users/42`)
        // or stringified `params`, so it is gated behind `sendDefaultPii`.
        ...(sendPii ? { 'route.href': serializeHref(href) } : undefined),
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
    const sendPii = isSendDefaultPiiEnabled();
    // For concrete string hrefs (e.g. `/users/42`) the pathname carries the
    // resolved URL — gate it behind `sendDefaultPii`. Templated pathnames from
    // object hrefs (e.g. `{ pathname: '/users/[id]' }`) are structural and safe.
    const safePathname = parsed.concretePathname && !sendPii ? undefined : parsed.pathname;
    const safeRouteName = parsed.concretePathname && !sendPii ? method : parsed.routeName;

    addBreadcrumb({
      category: 'navigation',
      type: 'navigation',
      message: `Expo Router ${method}${safePathname ? ` to ${safePathname}` : ''}`,
      data: {
        method,
        ...(safePathname ? { pathname: safePathname } : undefined),
        // `href` (raw URL form) and `params` may contain user identifiers or
        // other PII (e.g. `/users/42`, `{ id: '42' }`). Mirror the behavior of
        // `reactnavigation.ts` and only include them when `sendDefaultPii` is on.
        ...(sendPii && parsed.href !== undefined ? { href: serializeHref(parsed.href) } : undefined),
        ...(sendPii && parsed.params ? { params: parsed.params } : undefined),
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
      name: `Navigation ${method}${safePathname ? ` to ${safePathname}` : ''}`,
      attributes: {
        'sentry.origin': SPAN_ORIGIN_AUTO_EXPO_ROUTER_NAVIGATION,
        'navigation.method': method,
        ...(safeRouteName ? { 'route.name': safeRouteName } : undefined),
        ...(sendPii && parsed.href !== undefined ? { 'route.href': serializeHref(parsed.href) } : undefined),
      },
    });

    try {
      const result = original.apply(router, args);
      span?.setStatus({ code: SPAN_STATUS_OK });
      span?.end();
      return result;
    } catch (error) {
      // Clear the pending value so a failed navigation does not leak its
      // method/href onto the next successful idle navigation span.
      clearPendingExpoRouterNavigation();
      span?.setStatus({ code: SPAN_STATUS_ERROR, message: String(error) });
      span?.end();
      throw error;
    }
  };
}

function parseMethodArgs(method: NavigationMethod, args: unknown[]): ParsedHref {
  if (method === 'back' || method === 'dismiss') {
    return { routeName: method, concretePathname: false };
  }
  return parseHref(args[0] as ExpoRouterHref | undefined);
}

function parseHref(href: ExpoRouterHref | undefined): ParsedHref {
  if (typeof href === 'string') {
    return { href, routeName: href, pathname: href, concretePathname: true };
  }
  if (href && typeof href === 'object') {
    const pathname = typeof href.pathname === 'string' ? href.pathname : undefined;
    return {
      href,
      routeName: pathname ?? 'unknown',
      pathname,
      params: href.params,
      concretePathname: false,
    };
  }
  return { routeName: 'unknown', concretePathname: false };
}

/**
 * Serializes an href into a string for inclusion in spans/breadcrumbs.
 *
 * Wrapped in `try/catch` because `params` may contain values that `JSON.stringify`
 * cannot serialize (BigInt, Symbol, circular references). A failure here must
 * never prevent the underlying navigation from running.
 */
function serializeHref(href: unknown): string {
  if (typeof href === 'string') {
    return href;
  }
  try {
    return JSON.stringify(href);
  } catch {
    return '[unserializable href]';
  }
}

function isSendDefaultPiiEnabled(): boolean {
  return getClient()?.getOptions()?.sendDefaultPii ?? false;
}
