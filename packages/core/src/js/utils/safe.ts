import { debug } from '@sentry/core';

import type { ReactNativeOptions } from '../options';

type DangerTypesWithoutCallSignature = object | null | undefined;

/**
 * Returns callback factory wrapped with try/catch
 * or the original passed value is it's not a function.
 *
 * If the factory fails the original data are returned as is (they might be
 * partially modified by the failed function), unless an `onError` handler is
 * provided to compute a different fallback value.
 */
export function safeFactory<A extends [R, ...unknown[]], R, T extends DangerTypesWithoutCallSignature>(
  danger: ((...args: A) => R) | T,
  options: {
    loggerMessage?: string;
    /**
     * Computes the value returned when the wrapped function throws.
     * Defaults to returning the first argument (the unmodified input).
     */
    onError?: (...args: A) => R;
  } = {},
): ((...args: A) => R) | T {
  if (typeof danger === 'function') {
    return (...args) => {
      try {
        return danger(...args);
      } catch (error) {
        debug.error(
          options.loggerMessage ? options.loggerMessage : `The ${danger.name} callback threw an error`,
          error,
        );
        return options.onError ? options.onError(...args) : args[0];
      }
    };
  } else {
    return danger;
  }
}

type TracesSampler = Required<ReactNativeOptions>['tracesSampler'];

/**
 * Returns a safe tracesSampler that falls back to the configured `tracesSampleRate`
 * if the original callback throws.
 *
 * Per the Callback Error Isolation spec the fallback MUST NOT substitute a hardcoded
 * `0` or `1`; when no `tracesSampleRate` is configured the returned `undefined` lets
 * the core sampling pipeline discard the transaction.
 */
export function safeTracesSampler(
  tracesSampler: ReactNativeOptions['tracesSampler'],
  tracesSampleRate: ReactNativeOptions['tracesSampleRate'],
): ReactNativeOptions['tracesSampler'] {
  if (tracesSampler) {
    return (...args: Parameters<TracesSampler>): ReturnType<TracesSampler> => {
      try {
        return tracesSampler(...args);
      } catch (error) {
        debug.error('The tracesSampler callback threw an error, falling back to tracesSampleRate', error);
        return tracesSampleRate as ReturnType<TracesSampler>;
      }
    };
  } else {
    return tracesSampler;
  }
}
