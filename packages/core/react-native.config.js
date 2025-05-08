module.exports = {
  dependency: {
    assets: ['images'],
    platforms: {
      ios: {},
      android: {
        packageInstance: 'new RNSentryPackage()',
        packageImportPath: 'import io.sentry.react.RNSentryPackage;',
      },
    },
  },
};
