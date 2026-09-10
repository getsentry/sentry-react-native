const { withSentryConfig } = require('@sentry/react-native/metro');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const { withMonorepo } = require('sentry-react-native-samples-utils/metro');

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {};

const mergedConfig = mergeConfig(getDefaultConfig(__dirname), config);

const sentryConfig = withSentryConfig(mergedConfig, {
  annotateReactComponents: true,
});

module.exports = withMonorepo(sentryConfig);
