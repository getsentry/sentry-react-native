// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('@expo/metro-config');
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const { withMonorepo } = require('sentry-react-native-samples-utils/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getSentryExpoConfig(__dirname, {
  // [Web-only]: Enables CSS support in Metro.
  isCSSEnabled: true,
  getDefaultConfig,
  annotateReactComponents: {
    ignoredComponents: ['BottomTabsNavigator'],
  },
  // Auto-wrap `export { ErrorBoundary } from 'expo-router'` so the Expo Router
  // per-route boundary is captured by Sentry without route-file edits.
  autoWrapExpoRouterErrorBoundary: true,
});

module.exports = withMonorepo(config);
