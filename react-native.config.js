module.exports = {
  dependency: {
    platforms: {
      ios: {},
      android: {
        packageInstance: 'new RNSentryPackage(),\n      new RNSentryTimeToDisplayPackage()',
        packageImportPath: 'import io.sentry.react.RNSentryPackage;\nimport io.sentry.react.RNSentryTimeToDisplayPackage;'
      }
    }
  }
};
