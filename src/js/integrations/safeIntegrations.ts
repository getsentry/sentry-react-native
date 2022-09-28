import { logger } from '@sentry/utils';

import { ReactNativeOptions } from '../options';

/**
 * Returns Integrations callback wrapped with try/catch
 * or undefined | Array if Integrations is not a function.
 *
 * Wrapped callback returns default integrations variable if error occurred.
 */
export function safeIntegrations(integrations: ReactNativeOptions['integrations']):
  ReactNativeOptions['integrations'] {
  if (integrations && !Array.isArray(integrations)) {
    return (defaultIntegrations) => {
      try {
        return integrations(defaultIntegrations);
      } catch (error) {
        logger.error('The Integrations callback threw an error: ', error);
        return defaultIntegrations;
      }
    };
  } else {
    return integrations;
  }
}
