// Without this config the codegen fails
// because it can find @sentry/react-native
// in the dependencies
const path = require('path');

module.exports = {
  dependencies: {
    RNSentry: {
      root: path.resolve(__dirname, '..'),
    },
  },
};
