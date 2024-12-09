import { logger } from '@sentry/core';

/**
 * Enables debug logger when SENTRY_LOG_LEVEL=debug.
 */
export function enableLogger(): void {
  if (process.env.SENTRY_LOG_LEVEL === 'debug') {
    logger.enable();
  }
}
