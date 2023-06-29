const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');
const blacklist = require('metro-config/src/defaults/exclusionList');
const bundleToString = require('metro/src/lib/bundleToString');
const baseJSBundle = require('metro/src/DeltaBundler/Serializers/baseJSBundle');
const CountingSet = require('metro/src/lib/CountingSet').default;
const countLines = require('metro/src/lib/countLines');

const parentDir = path.resolve(__dirname, '..');

const debugIdCode = 'console.log("debugId");';
const debugIdModule = {
  dependencies: new Map(),
  getSource: () => Buffer.from(debugIdCode),
  inverseDependencies: new CountingSet(),
  path: '__debugid__',
  output: [
    {
      type: 'js/script/virtual',
      data: {
        code: debugIdCode,
        lineCount: countLines(debugIdCode),
        map: [],
      },
    },
  ],
};

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
    customSerializer: (entryPoint, preModules, graph, options) => {
      console.log('Adding debugId module...');
      preModules.unshift(debugIdModule);
      const bundle = baseJSBundle(entryPoint, preModules, graph, options);
      return bundleToString(bundle).code;
    },
  },
};

const m = mergeConfig(getDefaultConfig(__dirname), config);
// m.transformer.getTransformOptions().then(opts => {
//   console.log(opts);
// });
module.exports = m;
