const { withSentryConfig } = require('@sentry/react-native/metro');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const { withMonorepo } = require('sentry-react-native-samples-utils/metro');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {};

const mergedConfig = mergeConfig(getDefaultConfig(__dirname), config);

const sentryConfig = withSentryConfig(mergedConfig, {
  annotateReactComponents: {
    ignoredComponents: ['BottomTabsNavigator'],
  },
});

module.exports = withMonorepo(sentryConfig);
