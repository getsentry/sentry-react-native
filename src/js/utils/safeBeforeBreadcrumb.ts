import { logger } from '@sentry/utils';

import { ReactNativeOptions } from '../options';

/**
 * Returns beforeBreadcrumb callback wrapped with try/catch
 * or undefined if beforeBreadcrumb is not defined.
 *
 * Wrapped callback returns original breadcrumb variable if error occurred.
 */
export function safeBeforeBreadcrumb(beforeBreadcrumb: ReactNativeOptions['beforeBreadcrumb']):
  ReactNativeOptions['beforeBreadcrumb'] {
  if (beforeBreadcrumb) {
    return (breadcrumb, hint) => {
      try {
        return beforeBreadcrumb(breadcrumb, hint);
      } catch (error) {
        logger.error('The BeforeBreadcrumb threw an error: ', error);
        return breadcrumb;
      }
    };
  } else {
    return undefined;
  }
}
