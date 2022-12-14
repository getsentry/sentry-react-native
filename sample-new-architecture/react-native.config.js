// Without this config the codegen fails
// because it can find @sentry/react-native
// in the dependencies
module.exports = {
  dependencies: {
    RNSentry: {
      root: '../',
    },
  },
};
