const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');
const blacklist = require('metro-config/src/defaults/exclusionList');

const {
  createSentryMetroSerializer,
} = require('../dist/js/tools/sentryMetroSerializer');
const parentDir = path.resolve(__dirname, '..');

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  projectRoot: __dirname,
  watchFolders: [
    path.resolve(__dirname, 'node_modules'),
    `${parentDir}/dist`,
    `${parentDir}/node_modules`,
  ],
  resolver: {
    blacklistRE: blacklist([
      new RegExp(`${parentDir}/node_modules/react-native/.*`),
      new RegExp('.*\\android\\.*'), // Required for Windows in order to run the Sample.
    ]),
    extraNodeModules: new Proxy(
      {
        /*
           As the parent dir node_modules is blacklisted as you can see above. So it won't be able
           to find react-native to build the code from the parent folder,
           so we'll have to redirect it to use the react-native inside sample's node_modules.
         */
        'react-native': path.resolve(__dirname, 'node_modules/react-native'),
      },
      {
        get: (target, name) => {
          if (target.hasOwnProperty(name)) {
            return target[name];
          }
          return path.join(process.cwd(), `node_modules/${name}`);
        },
      },
    ),
  },
  serializer: {
    customSerializer: createSentryMetroSerializer(),
  },
};

const m = mergeConfig(getDefaultConfig(__dirname), config);
module.exports = m;
