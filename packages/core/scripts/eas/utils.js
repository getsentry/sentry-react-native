/**
 * Shared utilities for EAS Build Hook scripts.
 *
 * @see https://docs.expo.dev/build-reference/npm-hooks/
 */

/* eslint-disable no-console */

const path = require('path');
const fs = require('fs');

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

/**
 * Loads the EAS build hooks module from the compiled output.
 * @returns {object} The hooks module exports
 * @throws {Error} If the module cannot be loaded
 */
function loadHooksModule() {
  try {
    return require('../../dist/js/tools/easBuildHooks.js');
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

/**
 * Wraps an async hook function with error handling.
 * @param {string} hookName - Name of the hook for logging
 * @param {Function} hookFn - Async function to execute
 */
async function runHook(hookName, hookFn) {
  try {
    await hookFn();
    console.log(`[Sentry] EAS build ${hookName} hook completed.`);
  } catch (error) {
    console.error(`[Sentry] Error in eas-build-${hookName} hook:`, error);
    // Don't fail the build hook itself
  }
}

module.exports = {
  loadEnv,
  loadHooksModule,
  parseBaseOptions,
  runHook,
};
