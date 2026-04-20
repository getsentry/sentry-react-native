import type { ErrorBoundaryProps } from '@sentry/react';

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

interface GlobalErrorThrowerProps {
  error: unknown | null;
  children?: React.ReactNode | (() => React.ReactNode);
}

/**
 * Tiny component that re-throws a global error during render so the
 * surrounding `ErrorBoundary` catches it through the standard React path.
 */
class GlobalErrorThrower extends React.Component<GlobalErrorThrowerProps> {
  public render(): React.ReactNode {
    if (this.props.error !== null && this.props.error !== undefined) {
      // Throwing here routes the error into the surrounding ErrorBoundary's
      // getDerivedStateFromError / componentDidCatch lifecycle.
      throw this.props.error;
    }
    return typeof this.props.children === 'function' ? this.props.children() : this.props.children;
  }
}

interface GlobalErrorBoundaryState {
  globalError: unknown | null;
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
 * The Sentry error pipeline (capture → flush → mechanism tagging) is
 * unchanged; this component only surfaces the fallback UI and suppresses
 * React Native's default fatal handler while the fallback is mounted.
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
  public state: GlobalErrorBoundaryState = { globalError: null };

  private _unsubscribe?: () => void;
  private _latched = false;

  public componentDidMount(): void {
    this._unsubscribe = subscribeGlobalError(this._onGlobalError, {
      fatal: true,
      nonFatal: !!this.props.includeNonFatalGlobalErrors,
      unhandledRejection: !!this.props.includeUnhandledRejections,
    });
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
      this._unsubscribe = subscribeGlobalError(this._onGlobalError, {
        fatal: true,
        nonFatal: !!this.props.includeNonFatalGlobalErrors,
        unhandledRejection: !!this.props.includeUnhandledRejections,
      });
    }
  }

  public render(): React.ReactNode {
    const {
      children,
      onReset,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      includeNonFatalGlobalErrors: _ignoredA,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      includeUnhandledRejections: _ignoredB,
      ...forwarded
    } = this.props;

    return (
      <ErrorBoundary {...forwarded} onReset={this._onReset(onReset)}>
        <GlobalErrorThrower error={this.state.globalError}>{children}</GlobalErrorThrower>
      </ErrorBoundary>
    );
  }

  private _onGlobalError = (event: GlobalErrorEvent): void => {
    // Keep the first error — once the fallback is up, subsequent errors
    // shouldn't rewrite what the user is looking at. We use an instance flag
    // instead of reading state because multiple publishes can fire in the
    // same batch, before setState has flushed.
    if (this._latched) return;
    this._latched = true;
    this.setState({ globalError: event.error ?? new Error('Unknown global error') });
  };

  private _onReset =
    (userOnReset: GlobalErrorBoundaryProps['onReset']) =>
    (error: unknown, componentStack: string, eventId: string): void => {
      this._latched = false;
      this.setState({ globalError: null });
      userOnReset?.(error, componentStack, eventId);
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
