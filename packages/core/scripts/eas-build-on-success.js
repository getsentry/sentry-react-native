#!/usr/bin/env node
/**
 * EAS Build Hook: on-success
 *
 * This script captures EAS build successes and reports them to Sentry.
 * Add it to your package.json scripts:
 *
 *   "eas-build-on-success": "sentry-eas-build-on-success"
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

const path = require('path');
const fs = require('fs');

// Try to load environment variables
function loadEnv() {
  // Try @expo/env first
  try {
    require('@expo/env').load('.');
  } catch (_e) {
    // Fallback to dotenv if available
    try {
      const dotenvPath = path.join(process.cwd(), '.env');
      if (fs.existsSync(dotenvPath)) {
        const dotenvFile = fs.readFileSync(dotenvPath, 'utf-8');
        const dotenv = require('dotenv');
        Object.assign(process.env, dotenv.parse(dotenvFile));
      }
    } catch (_e2) {
      // No dotenv available, continue with existing env vars
    }
  }

  // Also load .env.sentry-build-plugin if it exists
  try {
    const sentryEnvPath = path.join(process.cwd(), '.env.sentry-build-plugin');
    if (fs.existsSync(sentryEnvPath)) {
      const dotenvFile = fs.readFileSync(sentryEnvPath, 'utf-8');
      const dotenv = require('dotenv');
      Object.assign(process.env, dotenv.parse(dotenvFile));
    }
  } catch (_e) {
    // Continue without .env.sentry-build-plugin
  }
}

async function main() {
  loadEnv();

  // Dynamically import the hooks module (it's compiled to dist/)
  let captureEASBuildSuccess;
  try {
    // Try the compiled output first
    const hooks = require('../dist/js/tools/easBuildHooks.js');
    captureEASBuildSuccess = hooks.captureEASBuildSuccess;
  } catch (_e) {
    console.error('[Sentry] Could not load EAS build hooks module. Make sure @sentry/react-native is properly installed.');
    process.exit(1);
  }

  // Parse options from environment variables
  const options = {
    dsn: process.env.SENTRY_DSN,
    successMessage: process.env.SENTRY_EAS_BUILD_SUCCESS_MESSAGE,
    captureSuccessfulBuilds: process.env.SENTRY_EAS_BUILD_CAPTURE_SUCCESS === 'true',
  };

  // Parse additional tags if provided
  if (process.env.SENTRY_EAS_BUILD_TAGS) {
    try {
      options.tags = JSON.parse(process.env.SENTRY_EAS_BUILD_TAGS);
    } catch (_e) {
      console.warn('[Sentry] Could not parse SENTRY_EAS_BUILD_TAGS as JSON. Ignoring.');
    }
  }

  try {
    await captureEASBuildSuccess(options);
    console.log('[Sentry] EAS build success hook completed.');
  } catch (error) {
    console.error('[Sentry] Error in eas-build-on-success hook:', error);
    // Don't fail the build hook itself
  }
}

main();
