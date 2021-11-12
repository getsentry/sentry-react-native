/**
 * Metro configuration for React Native
 * https://github.com/facebook/react-native
 *
 * @format
 */

const path = require('path');

const original = require('./metro.config.orig');

module.exports = {
  ...original,
  watchFolders: [path.resolve(__dirname, 'node_modules')],
};
