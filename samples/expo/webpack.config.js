const path = require('path');

const createExpoWebpackConfigAsync = require('@expo/webpack-config');

module.exports = async function (env, argv) {
  const config = await createExpoWebpackConfigAsync(env, argv);
  // Customize the config before returning it.
  config.resolve.alias = {
    ...config.resolve.alias,
    'react-native-web': path.resolve(__dirname, 'node_modules/react-native-web'),
  };
  return config;
};
