import { logger } from '@sentry/utils';

import type { ReactNativeOptions } from '../options';

type DangerTypesWithoutCallSignature =
  // eslint-disable-next-line @typescript-eslint/ban-types
  Object | null | undefined;

/**
 * Returns callback factory wrapped with try/catch
 * or the original passed value is it's not a function.
 *
 * If the factory fails original data are returned as it.
 * They might be partially modified by the failed function.
 */
export function safeFactory<A extends [R, ...unknown[]], R, T extends DangerTypesWithoutCallSignature>(
  danger: ((...args: A) => R) | T,
  options: {
    loggerMessage?: string;
  } = {},
): ((...args: A) => R) | T {
  if (typeof danger === 'function') {
    return (...args) => {
      try {
        return danger(...args);
      } catch (error) {
        logger.error(
          options.loggerMessage ? options.loggerMessage : `The ${danger.name} callback threw an error`,
          error,
        );
        return args[0];
      }
    };
  } else {
    return danger;
  }
}

type TracesSampler = Required<ReactNativeOptions>['tracesSampler'];

/**
 * Returns sage tracesSampler that returns 0 if the original failed.
 */
export function safeTracesSampler(
  tracesSampler: ReactNativeOptions['tracesSampler'],
): ReactNativeOptions['tracesSampler'] {
  if (tracesSampler) {
    return (...args: Parameters<TracesSampler>): ReturnType<TracesSampler> => {
      try {
        return tracesSampler(...args);
      } catch (error) {
        logger.error('The tracesSampler callback threw an error', error);
        return 0;
      }
    };
  } else {
    return tracesSampler;
  }
}
