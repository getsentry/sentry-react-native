#!/usr/bin/env node
/**
 * EAS Build Hook
 *
 * Unified entry point for all EAS build hooks (on-complete, on-error, on-success).
 * The hook name is determined from the bin command name in process.argv[1]
 * (e.g. sentry-eas-build-on-error → on-error) or can be passed as a CLI argument.
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
 * @see https://docs.expo.dev/build-reference/npm-hooks/
 * @see https://docs.sentry.io/platforms/react-native/
 */

const path = require('path');
const fs = require('fs');

// ─── Environment loading ─────────────────────────────────────────────────────

/**
 * Merges parsed env vars into process.env without overwriting existing values.
 * This preserves EAS secrets and other pre-set environment variables.
 * @param {object} parsed - Parsed environment variables from dotenv
 */
function mergeEnvWithoutOverwrite(parsed) {
  for (const key of Object.keys(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = parsed[key];
    }
  }
}

/**
 * Loads environment variables from various sources:
 * - @expo/env (if available)
 * - .env file (via dotenv, if available)
 * - .env.sentry-build-plugin file
 *
 * NOTE: Existing environment variables (like EAS secrets) are NOT overwritten.
 */
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
        mergeEnvWithoutOverwrite(dotenv.parse(dotenvFile));
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
      mergeEnvWithoutOverwrite(dotenv.parse(dotenvFile));
    }
  } catch (_e) {
    // Continue without .env.sentry-build-plugin
  }
}

// ─── Hooks module & options ──────────────────────────────────────────────────

/**
 * Loads the EAS build hooks module from the compiled output.
 * @returns {object} The hooks module exports
 * @throws {Error} If the module cannot be loaded
 */
function loadHooksModule() {
  try {
    return require('../dist/js/tools/easBuildHooks.js');
  } catch (_e) {
    console.error('[Sentry] Could not load EAS build hooks module. Make sure @sentry/react-native is properly installed.');
    process.exit(1);
  }
}

/**
 * Parses common options from environment variables.
 * @returns {object} Parsed options object
 */
function parseBaseOptions() {
  const options = {
    dsn: process.env.SENTRY_DSN,
  };

  // Parse additional tags if provided
  if (process.env.SENTRY_EAS_BUILD_TAGS) {
    try {
      const parsed = JSON.parse(process.env.SENTRY_EAS_BUILD_TAGS);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        options.tags = parsed;
      } else {
        console.warn('[Sentry] SENTRY_EAS_BUILD_TAGS must be a JSON object (e.g., {"key":"value"}). Ignoring.');
      }
    } catch (_e) {
      console.warn('[Sentry] Could not parse SENTRY_EAS_BUILD_TAGS as JSON. Ignoring.');
    }
  }

  return options;
}

// ─── Hook configuration & execution ─────────────────────────────────────────

/**
 * Hook configuration keyed by hook name.
 *
 * Each entry defines which extra env vars to read and which hooks module
 * method to call.
 */
const HOOK_CONFIGS = {
  'on-complete': {
    envKeys: {
      errorMessage: 'SENTRY_EAS_BUILD_ERROR_MESSAGE',
      successMessage: 'SENTRY_EAS_BUILD_SUCCESS_MESSAGE',
      captureSuccessfulBuilds: 'SENTRY_EAS_BUILD_CAPTURE_SUCCESS',
    },
    method: 'captureEASBuildComplete',
  },
  'on-error': {
    envKeys: {
      errorMessage: 'SENTRY_EAS_BUILD_ERROR_MESSAGE',
    },
    method: 'captureEASBuildError',
  },
  'on-success': {
    envKeys: {
      successMessage: 'SENTRY_EAS_BUILD_SUCCESS_MESSAGE',
      captureSuccessfulBuilds: 'SENTRY_EAS_BUILD_CAPTURE_SUCCESS',
    },
    // When a user explicitly configures the on-success hook, they intend to
    // capture successful builds, so default captureSuccessfulBuilds to true.
    defaults: { captureSuccessfulBuilds: true },
    method: 'captureEASBuildSuccess',
  },
};

/**
 * Runs an EAS build hook by name.
 *
 * Loads the environment, resolves hook-specific options from env vars,
 * and calls the corresponding hooks module method.
 *
 * @param {'on-complete' | 'on-error' | 'on-success'} hookName
 */
async function runEASBuildHook(hookName) {
  const config = HOOK_CONFIGS[hookName];
  if (!config) {
    throw new Error(`Unknown EAS build hook: ${hookName}`);
  }

  loadEnv();

  const hooks = loadHooksModule();
  const options = {
    ...parseBaseOptions(),
    ...config.defaults,
  };

  for (const [optionKey, envKey] of Object.entries(config.envKeys)) {
    if (optionKey === 'captureSuccessfulBuilds') {
      // Only override the default when the env var is explicitly set
      if (process.env[envKey] !== undefined) {
        options[optionKey] = process.env[envKey] === 'true';
      }
    } else if (process.env[envKey] !== undefined) {
      options[optionKey] = process.env[envKey];
    }
  }

  try {
    await hooks[config.method](options);
    console.log(`[Sentry] EAS build ${hookName} hook completed.`);
  } catch (error) {
    console.error(`[Sentry] Error in eas-build-${hookName} hook:`, error);
    // Don't fail the build hook itself
  }
}

// ─── Hook name resolution & entry point ─────────────────────────────────────

const HOOK_NAME_RE = /(?:sentry-eas-build-|build-)(on-(?:complete|error|success))/;

/**
 * Resolves which hook to run.
 *
 * 1. Explicit CLI argument: `node build-hook.js on-error`
 * 2. Derived from the script path in process.argv[1]
 */
function resolveHookName() {
  const arg = process.argv[2];
  if (arg && /^on-(complete|error|success)$/.test(arg)) {
    return arg;
  }

  const caller = path.basename(process.argv[1] || '', '.js');
  const match = caller.match(HOOK_NAME_RE);
  if (match) {
    return match[1];
  }

  console.error(
    '[Sentry] Could not determine EAS build hook name. ' +
      'Pass one of: on-complete, on-error, on-success',
  );
  process.exit(1);
}

const hookName = resolveHookName();

runEASBuildHook(hookName).catch(error => {
  console.error(`[Sentry] Unexpected error in eas-build-${hookName} hook:`, error);
  process.exit(1);
});
