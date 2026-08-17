const { withSentryConfig } = require('@sentry/react-native/metro');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const { withMonorepo } = require('sentry-react-native-samples-utils/metro');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {};

const mergedConfig = mergeConfig(getDefaultConfig(__dirname), config);

const sentryConfig = withSentryConfig(mergedConfig, {
  annotateReactComponents: {
    ignoredComponents: ['BottomTabsNavigator'],
  },
  // "Loud Invariants" demo: rewrite `invariant`/`assert`/`warning`/`console.assert`
  // call sites so a violated assertion reports a non-fatal Sentry event instead
  // of throwing. First-party code is instrumented by default; the `includeNodeModules`
  // allowlist narrowly extends this to React Native's Dimensions module so its
  // `invariant` (e.g. `Dimensions.get('unknown')`) becomes loud with no source
  // changes — without blanket-instrumenting all of node_modules.
  loudInvariants: {
    includeNodeModules: ['react-native/Libraries/Utilities/Dimensions'],
    // The demo targets one known module, so skip import-resolution gating.
    requireResolvedImport: false,
  },
});

module.exports = withMonorepo(sentryConfig);
