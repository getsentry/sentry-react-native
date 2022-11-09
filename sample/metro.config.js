/**
 * Metro configuration for React Native
 * https://github.com/facebook/react-native
 *
 * @format
 */

const path = require('path');
const blacklist = require('metro-config/src/defaults/exclusionList');
const resolve = require('metro-resolver/src/resolve');

const parentDir = path.resolve(__dirname, '..');

module.exports = {
  projectRoot: __dirname,
  watchFolders: [path.resolve(__dirname, 'node_modules'), parentDir],
  resolver: {
    blacklistRE: blacklist([
      new RegExp(`${parentDir}/node_modules/react-native/.*`),
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
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: false,
      },
    }),
  },
};
