const { withMonorepo } = require('sentry-react-native-samples-utils/metro');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const {
 withSentryConfig
} = require("@sentry/react-native/metro");

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {};

const sentryConfig = withSentryConfig(mergeConfig(getDefaultConfig(__dirname), config));

module.exports = withMonorepo(sentryConfig);