// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('@expo/metro-config');
const path = require('path');

const { getSentryExpoConfig } = require('../../metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getSentryExpoConfig(__dirname, {
  // [Web-only]: Enables CSS support in Metro.
  isCSSEnabled: true,
  getDefaultConfig,
  annotateReactComponents: true,
});

config.watchFolders.push(path.resolve(__dirname, '../../node_modules/@sentry'));
config.watchFolders.push(path.resolve(__dirname, '../../node_modules/@sentry-internal'));
config.watchFolders.push(path.resolve(__dirname, '../../node_modules/tslib'));
config.watchFolders.push(path.resolve(__dirname, '../../node_modules/hoist-non-react-statics'));
config.watchFolders.push(path.resolve(__dirname, '../../node_modules/localforage'));
config.watchFolders.push(path.resolve(__dirname, '../../node_modules/@react-native/js-polyfills'));
config.watchFolders.push(`${__dirname}/../../dist`);

const exclusionList = [new RegExp(`${__dirname}/../../node_modules/react-native/.*`)];

if (config.resolver.blacklistRE) {
  config.resolver.blacklistRE.push(...exclusionList);
} else {
  config.resolver.blacklistRE = exclusionList;
}

config.resolver.extraNodeModules = new Proxy(
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
);

module.exports = config;
