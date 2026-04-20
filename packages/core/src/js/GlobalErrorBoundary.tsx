import type { ErrorBoundaryProps } from '@sentry/react';

import { lastEventId } from '@sentry/core';
import { ErrorBoundary } from '@sentry/react';
import * as React from 'react';

import type { GlobalErrorEvent } from './integrations/globalErrorBus';

import { subscribeGlobalError } from './integrations/globalErrorBus';

/**
 * Props for {@link GlobalErrorBoundary}. Extends the standard `ErrorBoundary`
 * props from `@sentry/react` with two opt-ins that control which
 * non-rendering errors trigger the fallback UI.
 */
export type GlobalErrorBoundaryProps = ErrorBoundaryProps & {
  /**
   * If `true`, the fallback is also rendered for *non-fatal* errors routed
   * through `ErrorUtils` (React Native's global handler).
   *
   * Defaults to `false` — only fatals trigger the fallback, matching the
   * semantics of the native red-screen.
   */
  includeNonFatalGlobalErrors?: boolean;

  /**
   * If `true`, the fallback is also rendered for unhandled promise rejections.
   *
   * Defaults to `false` because many apps prefer to surface rejections as
   * toasts / inline errors rather than as a full-screen fallback.
   */
  includeUnhandledRejections?: boolean;
};

interface GlobalErrorBoundaryState {
  globalError: unknown | null;
  globalEventId: string;
}

/**
 * An error boundary that also catches **non-rendering** fatal JS errors.
 *
 * In addition to the render-phase errors caught by `Sentry.ErrorBoundary`,
 * this component renders the provided fallback when:
 *
 * - A fatal error is reported through React Native's `ErrorUtils` global
 *   handler (event handlers, timers, native → JS bridge errors, …).
 * - Optionally, non-fatal global errors (opt-in via
 *   `includeNonFatalGlobalErrors`).
 * - Optionally, unhandled promise rejections (opt-in via
 *   `includeUnhandledRejections`).
 *
 * The Sentry error pipeline (capture → flush → mechanism tagging) runs in the
 * integration before this component is notified, so the fallback UI surfaces
 * an already-captured event and does not generate a duplicate.
 *
 * Intended usage is at the top of the component tree, typically just inside
 * `Sentry.wrap()`:
 *
 * ```tsx
 * <Sentry.GlobalErrorBoundary
 *   fallback={({ error, resetError }) => (
 *     <MyFallback error={error} onRetry={resetError} />
 *   )}
 * >
 *   <App />
 * </Sentry.GlobalErrorBoundary>
 * ```
 */
export class GlobalErrorBoundary extends React.Component<GlobalErrorBoundaryProps, GlobalErrorBoundaryState> {
  public state: GlobalErrorBoundaryState = { globalError: null, globalEventId: '' };

  private _unsubscribe?: () => void;
  private _latched = false;

  public componentDidMount(): void {
    this._subscribe();
  }

  public componentWillUnmount(): void {
    this._unsubscribe?.();
    this._unsubscribe = undefined;
  }

  public componentDidUpdate(prevProps: GlobalErrorBoundaryProps): void {
    // Re-subscribe if the opt-in flags change so the filter stays accurate.
    if (
      prevProps.includeNonFatalGlobalErrors !== this.props.includeNonFatalGlobalErrors ||
      prevProps.includeUnhandledRejections !== this.props.includeUnhandledRejections
    ) {
      this._unsubscribe?.();
      this._subscribe();
    }
  }

  public render(): React.ReactNode {
    const { globalError, globalEventId } = this.state;
    const {
      children,
      fallback,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      includeNonFatalGlobalErrors: _ignoredA,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      includeUnhandledRejections: _ignoredB,
      ...forwarded
    } = this.props;

    // Global-error path: render the fallback directly. The error was already
    // captured by the integration before the bus published it, so we must NOT
    // route it through @sentry/react's ErrorBoundary — its componentDidCatch
    // would call captureReactException and produce a duplicate Sentry event.
    if (globalError !== null && globalError !== undefined) {
      if (typeof fallback === 'function') {
        return fallback({
          error: globalError,
          componentStack: '',
          eventId: globalEventId,
          resetError: this._resetFromFallback,
        });
      }
      return fallback ?? null;
    }

    // Render-phase path: delegate to the upstream ErrorBoundary untouched.
    return (
      <ErrorBoundary {...forwarded} fallback={fallback} onReset={this._onRenderBoundaryReset}>
        {children}
      </ErrorBoundary>
    );
  }

  private _subscribe(): void {
    this._unsubscribe = subscribeGlobalError(this._onGlobalError, {
      fatal: true,
      nonFatal: !!this.props.includeNonFatalGlobalErrors,
      unhandledRejection: !!this.props.includeUnhandledRejections,
    });
  }

  private _onGlobalError = (event: GlobalErrorEvent): void => {
    // Keep the first error — once the fallback is up, subsequent errors
    // shouldn't rewrite what the user is looking at. We use an instance flag
    // instead of reading state because multiple publishes can fire in the
    // same batch, before setState has flushed.
    if (this._latched) {
      return;
    }
    this._latched = true;

    const error = event.error ?? new Error('Unknown global error');
    // Prefer the eventId threaded through the bus payload — it's the exact id
    // returned by the capture call that produced this notification. Fall back
    // to lastEventId() for older publishers that don't include it, then to ''
    // to satisfy the type contract.
    const eventId = event.eventId ?? lastEventId() ?? '';

    this.setState({ globalError: error, globalEventId: eventId });
    this.props.onError?.(error, '', eventId);
  };

  private _resetFromFallback = (): void => {
    const { globalError, globalEventId } = this.state;
    this._latched = false;
    this.setState({ globalError: null, globalEventId: '' });
    this.props.onReset?.(globalError, '', globalEventId);
  };

  private _onRenderBoundaryReset = (error: unknown, componentStack: string, eventId: string): void => {
    // Delegate to the user's onReset for render-phase resets; no internal
    // state to clear on this path.
    this.props.onReset?.(error, componentStack, eventId);
  };
}

/**
 * HOC counterpart to {@link GlobalErrorBoundary}.
 */
export function withGlobalErrorBoundary<P extends Record<string, unknown>>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryOptions: GlobalErrorBoundaryProps,
): React.FC<P> {
  const componentDisplayName = WrappedComponent.displayName || WrappedComponent.name || 'unknown';

  const Wrapped: React.FC<P> = props => (
    <GlobalErrorBoundary {...errorBoundaryOptions}>
      <WrappedComponent {...props} />
    </GlobalErrorBoundary>
  );

  Wrapped.displayName = `globalErrorBoundary(${componentDisplayName})`;

  return Wrapped;
}
