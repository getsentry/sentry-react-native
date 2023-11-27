module.exports = {
  presets: ['module:metro-react-native-babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        alias: {
          '@sentry/react-native': '../dist/js',
        },
      },
    ],
  ],
};
