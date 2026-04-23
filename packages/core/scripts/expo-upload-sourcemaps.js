#!/usr/bin/env node
try {
  require.resolve('@sentry/expo-upload-sourcemaps/cli.js');
} catch (e) {
  if (e && e.code === 'MODULE_NOT_FOUND') {
    console.error(
      "The '@sentry/expo-upload-sourcemaps' package is missing. Reinstall @sentry/react-native, or invoke `npx @sentry/expo-upload-sourcemaps dist` directly."
    );
    process.exit(1);
  }
  throw e;
}
require('@sentry/expo-upload-sourcemaps/cli.js');
