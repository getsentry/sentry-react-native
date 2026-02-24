#!/usr/bin/env node
/**
 * EAS Build Hook: on-complete
 *
 * This script captures EAS build completion events and reports them to Sentry.
 * It uses the EAS_BUILD_STATUS environment variable to determine whether
 * the build succeeded or failed.
 *
 * Add it to your package.json scripts:
 *
 *   "eas-build-on-complete": "sentry-eas-build-on-complete"
 *
 * NOTE: Use EITHER this hook OR the separate on-error/on-success hooks, not both.
 * Using both will result in duplicate events being sent to Sentry.
 *
 * Required environment variables:
 *   - SENTRY_DSN: Your Sentry DSN
 *
 * Optional environment variables:
 *   - SENTRY_EAS_BUILD_CAPTURE_SUCCESS: Set to 'true' to also capture successful builds
 *   - SENTRY_EAS_BUILD_TAGS: JSON string of additional tags
 *   - SENTRY_EAS_BUILD_ERROR_MESSAGE: Custom error message for failed builds
 *   - SENTRY_EAS_BUILD_SUCCESS_MESSAGE: Custom success message for successful builds
 *
 * EAS Build provides:
 *   - EAS_BUILD_STATUS: 'finished' or 'errored'
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
    successMessage: process.env.SENTRY_EAS_BUILD_SUCCESS_MESSAGE,
    captureSuccessfulBuilds: process.env.SENTRY_EAS_BUILD_CAPTURE_SUCCESS === 'true',
  };

  await runHook('on-complete', () => hooks.captureEASBuildComplete(options));
}

main();
