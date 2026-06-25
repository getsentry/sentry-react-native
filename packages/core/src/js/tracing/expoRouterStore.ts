/**
 * Shared helpers for reading Expo Router's internal router store.
 *
 * Used by:
 *  - {@link expoRouterIntegration} to attach the current route to the idle
 *    navigation span via {@link RouteOverride}.
 *  - {@link wrapExpoRouterErrorBoundary} to attach the current route to errors
 *    surfaced through Expo Router's per-route `ErrorBoundary`.
 */

export interface ExpoRouterNavigationRef {
  current: unknown | null;
}

export interface ExpoRouterUrlObject {
  unstable_globalHref?: string;
  pathname?: string;
  pathnameWithParams?: string;
  params?: Record<string, unknown>;
  segments?: string[];
}

export interface ExpoRouterStore {
  navigationRef?: ExpoRouterNavigationRef;
  getRouteInfo?: () => ExpoRouterUrlObject;
}

export interface NormalizedExpoRouterRouteInfo {
  /**
   * Templated pathname with grouping segments (`(tabs)`) removed. Safe to send
   * regardless of `sendDefaultPii`. Examples:
   *   ['(tabs)', 'profile', '[id]'] -> '/profile/[id]'
   *   ['posts', '[...slug]']        -> '/posts/[...slug]'
   *   []                            -> '/'
   */
  templatedPath: string;
  /** Concrete pathname (may contain user identifiers). Caller decides PII handling. */
  pathname?: string;
  /** Concrete pathname including query/params (may contain PII). */
  pathnameWithParams?: string;
  params?: Record<string, unknown>;
  segments?: string[];
}

/**
 * Returns Expo Router's internal router store, or `null` if `expo-router` is
 * not installed or the build does not expose the expected module path.
 */
export function tryGetExpoRouterStore(): ExpoRouterStore | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-router/build/global-state/router-store') as {
      store?: ExpoRouterStore;
    };
    return mod?.store ?? null;
  } catch {
    return null;
  }
}

/**
 * Builds a templated pathname from Expo Router's `segments`. Grouping segments
 * (e.g. `(tabs)`, `(auth)`) are stripped because they do not appear in the URL.
 */
export function buildExpoRouterTemplatedPath(segments: string[] | undefined): string {
  if (!segments || segments.length === 0) {
    return '/';
  }
  const filtered = segments.filter(s => !(s.startsWith('(') && s.endsWith(')')));
  return filtered.length === 0 ? '/' : `/${filtered.join('/')}`;
}

/**
 * Reads the current route from Expo Router's store and normalizes it. Returns
 * `undefined` if the store is not reachable or `getRouteInfo` throws.
 */
export function getCurrentExpoRouterRouteInfo(): NormalizedExpoRouterRouteInfo | undefined {
  const store = tryGetExpoRouterStore();
  if (!store) {
    return undefined;
  }
  let info: ExpoRouterUrlObject | undefined;
  try {
    info = store.getRouteInfo?.();
  } catch {
    return undefined;
  }
  if (!info) {
    return undefined;
  }
  return {
    templatedPath: buildExpoRouterTemplatedPath(info.segments),
    pathname: info.pathname,
    pathnameWithParams: info.pathnameWithParams,
    params: info.params,
    segments: info.segments,
  };
}
