#!/usr/bin/env node
/**
 * EAS Build Hook: on-success
 *
 * This script captures EAS build successes and reports them to Sentry.
 * Add it to your package.json scripts:
 *
 *   "eas-build-on-success": "sentry-eas-build-on-success"
 *
 * NOTE: Use EITHER this hook (with on-error) OR the on-complete hook, not both.
 * Using both will result in duplicate events being sent to Sentry.
 *
 * Required environment variables:
 *   - SENTRY_DSN: Your Sentry DSN
 *   - SENTRY_EAS_BUILD_CAPTURE_SUCCESS: Set to 'true' to capture successful builds
 *
 * Optional environment variables:
 *   - SENTRY_EAS_BUILD_TAGS: JSON string of additional tags
 *   - SENTRY_EAS_BUILD_SUCCESS_MESSAGE: Custom success message
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
    successMessage: process.env.SENTRY_EAS_BUILD_SUCCESS_MESSAGE,
    captureSuccessfulBuilds: process.env.SENTRY_EAS_BUILD_CAPTURE_SUCCESS === 'true',
  };

  await runHook('on-success', () => hooks.captureEASBuildSuccess(options));
}

main().catch(error => {
  console.error('[Sentry] Unexpected error in eas-build-on-success hook:', error);
  process.exit(1);
});
