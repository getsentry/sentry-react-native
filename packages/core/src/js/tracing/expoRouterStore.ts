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
  getRootState?: () => unknown;
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
  getRouteInfo?: () => ExpoRouterUrlObject | undefined;
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

export interface ExpoRouterActionDispatchedEvent {
  actionType?: string;
  payload?: unknown;
}

export interface ExpoRouterInternalNavigationEvents {
  addListener: (
    name: 'actionDispatched',
    callback: (event: ExpoRouterActionDispatchedEvent) => void,
  ) => (() => void) | undefined;
}

/**
 * Returns the navigation container ref and route info of Expo Router, or `null`
 * if `expo-router` is not installed or does not expose the expected API.
 *
 * Expo Router 58 declares `exports`, so Metro warns about any deep path that is
 * missing from it. Older versions have no `exports`, so a missing deep path
 * there is a silent optional dependency.
 */
export function tryGetExpoRouterStore(): ExpoRouterStore | null {
  let getNavigationContainerRef: (() => ExpoRouterNavigationRef | undefined) | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const expoRouter = require('expo-router') as {
      useNavigationContainerRef?: () => ExpoRouterNavigationRef | undefined;
    };
    // Not a React hook: it reads a module-level store, so it is safe to call outside render.
    getNavigationContainerRef = expoRouter?.useNavigationContainerRef;
  } catch {
    return null;
  }
  if (!getNavigationContainerRef) {
    return null;
  }
  const getRef = getNavigationContainerRef;
  const readNavigationContainerRef = (): ExpoRouterNavigationRef | undefined => {
    try {
      return getRef();
    } catch {
      return undefined;
    }
  };
  const getRouteInfoFromState = tryGetRouteInfoFromState();

  return {
    // Before Expo Router 58 the ref is undefined until the Root Layout renders, so read it on every access.
    get navigationRef() {
      return readNavigationContainerRef();
    },
    getRouteInfo: getRouteInfoFromState
      ? () => {
          const navigationRef = readNavigationContainerRef();
          const state = navigationRef?.current ? navigationRef.getRootState?.() : undefined;
          return state ? getRouteInfoFromState(state) : undefined;
        }
      : undefined,
  };
}

/** `getRouteInfoFromState` exists only in Expo Router 56 and later. */
function tryGetRouteInfoFromState(): ((state: unknown) => ExpoRouterUrlObject) | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-router/build/global-state/getRouteInfoFromState') as {
      getRouteInfoFromState?: (state: unknown) => ExpoRouterUrlObject;
    };
    return mod?.getRouteInfoFromState;
  } catch {
    return undefined;
  }
}

/**
 * Returns the internal navigation event emitter of Expo Router 58 and later, or
 * `null` for older versions. Expo Router 58 does not emit React Navigation's
 * `__unsafe_action__` event, so this is the only signal of a dispatched action.
 */
export function tryGetExpoRouterNavigationEvents(): ExpoRouterInternalNavigationEvents | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-router/build/global-state/internalNavigationEvents') as {
      internalNavigationEvents?: ExpoRouterInternalNavigationEvents;
    };
    return mod?.internalNavigationEvents ?? null;
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
