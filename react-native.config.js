module.exports = {
  dependency: {
    platforms: {
      ios: {},
      android: {
        packageInstance: 'new RNSentryPackage()',
        packageImportPath: 'import io.sentry.react.RNSentryPackage;'
      }
    }
  }
};
