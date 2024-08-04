module.exports = function (api) {
  api.cache(false);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          alias: {
            '@sentry/react-native': '../../dist/js',
          },
        },
      ],
    ],
  };
};
