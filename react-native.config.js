module.exports = {
  dependency: {
    platforms: {
      ios: {
        sharedLibraries: ["libz"]
      },
      android: {
        packageInstance: "new RNSentryPackage()"
      }
    },
    hooks: {
      postlink:
        "npx @sentry/wizard -i reactNative -p ios android",
      postunlink:
        "npx @sentry/wizard -i reactNative -p ios android --uninstall"
    }
  }
};
