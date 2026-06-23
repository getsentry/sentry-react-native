import type { Scope } from '@sentry/core';

import {
  addBreadcrumb,
  addExceptionMechanism,
  captureException,
  getActiveSpan,
  getClient,
  getRootSpan,
  logger,
  SPAN_STATUS_ERROR,
  spanToJSON,
} from '@sentry/core';
import * as React from 'react';

import { getCurrentExpoRouterRouteInfo } from './expoRouterStore';

/**
 * Errors we have already reported. Module-scoped (rather than a per-instance
 * `useRef`) so that an unmount → remount cycle with the same error instance —
 * which can happen when a parent caches the error or React re-creates the
 * boundary — does not produce a duplicate event. Using a `WeakSet` lets the
 * entries be garbage-collected once nothing else references the error.
 */
const reportedErrors: WeakSet<object> = new WeakSet();

/**
 * The minimal shape of Expo Router's per-route `ErrorBoundary` props.
 *
 * We re-declare it here to avoid a hard dependency on `expo-router`.
 */
export interface ExpoRouterErrorBoundaryProps {
  error: Error;
  retry: () => Promise<void>;
}

/**
 * Wraps Expo Router's per-route `ErrorBoundary` so that the SDK captures
 * errors that hit the boundary instead of relying on the user's global error
 * handler.
 *
 * Expo Router renders the boundary exported from a route file
 * (`export { ErrorBoundary } from 'expo-router'`) when a component throws
 * during render. Without this wrapper, Sentry only sees the error if it also
 * reaches `ErrorUtils` — which it often does not, because React swallows the
 * error once a boundary handles it.
 *
 * For each new `error` instance the wrapper:
 *  - Captures the error to Sentry with `route.name`, `route.path`, and
 *    `route.params` attached, gated by `sendDefaultPii` for concrete fields.
 *  - Tags the active idle navigation span (and its root) with
 *    `SPAN_STATUS_ERROR` so the navigation transaction reflects the failure.
 *  - Adds a breadcrumb describing the boundary render.
 *
 * @example
 * ```ts
 * // app/_layout.tsx\n * import { ErrorBoundary as ExpoErrorBoundary } from 'expo-router';\n * import * as Sentry from '@sentry/react-native';\n *\n * export const ErrorBoundary = Sentry.wrapRouterErrorBoundary(ExpoErrorBoundary);\n * ```\n */
export function wrapRouterErrorBoundary<P extends ExpoRouterErrorBoundaryProps>(
  OriginalErrorBoundary: React.ComponentType<P>,
): React.ComponentType<P> {
  const Wrapped: React.FC<P> = props => {
    // Reporting is intentionally done in `useEffect` (commit phase) rather than
    // during render: render must be pure, and in Concurrent Mode an in-progress
    // render can be discarded — we only want to report errors that React
    // actually commits to the screen. Dedup is module-scoped so it survives
    // remounts of the boundary with the same error instance.
    const { error } = props;
    React.useEffect(() => {
      if (!error || reportedErrors.has(error)) {
        return;
      }
      // Defensive: a failure inside Sentry instrumentation must never prevent
      // Expo Router's fallback UI from rendering or break the host app. We
      // only mark the error as reported on success, so a transient failure
      // does not permanently suppress the capture for this error instance.
      try {
        reportRouterBoundaryError(error);
        reportedErrors.add(error);
      } catch (e) {
        logger.error(
          `[wrapRouterErrorBoundary] Failed to report boundary error: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }, [error]);

    return <OriginalErrorBoundary {...props} />;
  };

  Wrapped.displayName = `wrapRouterErrorBoundary(${
    OriginalErrorBoundary.displayName || OriginalErrorBoundary.name || 'ErrorBoundary'
  })`;

  return Wrapped as React.ComponentType<P>;
}

function reportRouterBoundaryError(error: Error): void {
  const sendPii = getClient()?.getOptions()?.sendDefaultPii ?? false;
  const route = getCurrentExpoRouterRouteInfo();

  const templatedPath = route?.templatedPath;
  // `templatedPath` (e.g. `/users/[id]`) is structural and safe; concrete path
  // (e.g. `/users/42`) and `params` may contain identifiers and are PII-gated.
  const routeName = templatedPath ?? 'unknown';
  const concretePath = sendPii ? (route?.pathnameWithParams ?? route?.pathname) : undefined;

  addBreadcrumb({
    category: 'expo-router.error_boundary',
    type: 'error',
    level: 'error',
    message: `Expo Router ErrorBoundary rendered for ${routeName}`,
    data: {
      'route.name': routeName,
      ...(concretePath ? { 'route.path': concretePath } : undefined),
    },
  });

  markActiveNavigationSpanErrored();

  captureException(error, (scope: Scope) => {
    scope.setTag('expo_router.error_boundary', 'true');
    scope.setContext('route', {
      name: routeName,
      ...(concretePath ? { path: concretePath } : undefined),
      ...(sendPii && route?.params ? { params: route.params } : undefined),
      ...(route?.segments ? { segments: route.segments } : undefined),
    });
    scope.addEventProcessor(event => {
      addExceptionMechanism(event, { type: 'expo_router_error_boundary', handled: true });
      return event;
    });
    return scope;
  });
}

/**
 * If an idle navigation span (or any child) is still open when the boundary
 * renders, mark its root as errored so the resulting transaction reflects the
 * navigation failure. Scoped to navigation roots so that a user-started
 * custom span is not retroactively flipped to errored. No-op otherwise.
 */
function markActiveNavigationSpanErrored(): void {
  const active = getActiveSpan();
  if (!active) {
    return;
  }
  const root = getRootSpan(active);
  const origin = spanToJSON(root).origin;
  if (typeof origin !== 'string' || !origin.startsWith('auto.navigation.')) {
    return;
  }
  root.setStatus({ code: SPAN_STATUS_ERROR, message: 'expo_router_error_boundary' });
}
