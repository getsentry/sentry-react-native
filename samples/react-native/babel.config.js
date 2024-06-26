const componentAnnotatePlugin = require('@sentry/babel-plugin-component-annotate');

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        alias: {
          '@sentry/react-native': '../../dist/js',
        },
      },
    ],
    'react-native-reanimated/plugin',
    componentAnnotatePlugin,
  ],
};
