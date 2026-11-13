const SENTRY_MIDDLEWARE_PATH = '__sentry';
export const SENTRY_CONTEXT_REQUEST_PATH = `${SENTRY_MIDDLEWARE_PATH}/context`;
export const SENTRY_OPEN_URL_REQUEST_PATH = `${SENTRY_MIDDLEWARE_PATH}/open-url`;
export const SENTRY_SYMBOLICATE_REQUEST_PATH = `${SENTRY_MIDDLEWARE_PATH}/symbolicate`;

/** Metro's own symbolication endpoint, which `SENTRY_SYMBOLICATE_REQUEST_PATH` forwards to. */
export const METRO_SYMBOLICATE_REQUEST_PATH = 'symbolicate';
