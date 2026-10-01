module.exports = {
  // React Native's SwiftPM autolinking names the package's target after the npm
  // package, which for `@sentry/react-native` collides with React Native's own
  // reserved `ReactNative`. The name is also the prefix our headers are imported
  // under (`<RNSentry/RNSentry.h>`), so pin it to the pod name. React Native
  // 0.88+ reads `swiftpmConfig.name` from package.json instead; both are set.
  spm: {
    name: 'RNSentry',
  },
  dependency: {
    platforms: {
      ios: {},
      android: {
        packageInstance: 'new RNSentryPackage()',
        packageImportPath: 'import io.sentry.react.RNSentryPackage;',
      },
    },
  },
};
