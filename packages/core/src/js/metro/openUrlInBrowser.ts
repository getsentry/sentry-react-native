import { logger } from '@sentry/core';

import { getDevServer } from '../integrations/debugsymbolicatorutils';
import { SENTRY_OPEN_URL_REQUEST_PATH } from './constants';

/**
 * Send request to the Metro Development Server Middleware to open a URL in the system browser.
 */
export function openURLInBrowser(url: string): void {
  // disable-next-line @typescript-eslint/no-floating-promises
  fetch(`${getDevServer()?.url || '/'}${SENTRY_OPEN_URL_REQUEST_PATH}`, {
    method: 'POST',
    body: JSON.stringify({ url }),
  }).catch(e => {
    logger.error('Error opening URL:', e);
  });
}
