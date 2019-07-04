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
        "node node_modules/@sentry/wizard/dist/bin.js -i reactNative -p ios android",
      postunlink:
        "node node_modules/@sentry/wizard/dist/bin.js -i reactNative -p ios android --uninstall"
    }
  }
};
