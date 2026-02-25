#!/usr/bin/env node
/**
 * EAS Build Hook: on-error
 *
 * This script captures EAS build failures and reports them to Sentry.
 * Add it to your package.json scripts:
 *
 *   "eas-build-on-error": "sentry-eas-build-on-error"
 *
 * NOTE: Use EITHER this hook (with on-success) OR the on-complete hook, not both.
 * Using both will result in duplicate events being sent to Sentry.
 *
 * Required environment variables:
 *   - SENTRY_DSN: Your Sentry DSN
 *
 * Optional environment variables:
 *   - SENTRY_EAS_BUILD_TAGS: JSON string of additional tags
 *   - SENTRY_EAS_BUILD_ERROR_MESSAGE: Custom error message
 *
 * @see https://docs.expo.dev/build-reference/npm-hooks/
 * @see https://docs.sentry.io/platforms/react-native/
 */

const { loadEnv, loadHooksModule, parseBaseOptions, runHook } = require('./utils');

async function main() {
  loadEnv();

  const hooks = loadHooksModule();
  const options = {
    ...parseBaseOptions(),
    errorMessage: process.env.SENTRY_EAS_BUILD_ERROR_MESSAGE,
  };

  await runHook('on-error', () => hooks.captureEASBuildError(options));
}

main().catch(error => {
  console.error('[Sentry] Unexpected error in eas-build-on-error hook:', error);
  process.exit(1);
});
