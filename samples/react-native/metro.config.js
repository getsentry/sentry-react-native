const path = require('path');
const { withSentryConfig } = require('@sentry/react-native/metro');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const exclusionList = require('metro-config/src/defaults/exclusionList');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  projectRoot: __dirname,
  watchFolders: [
    `${projectRoot}/node_modules`,
    `${monorepoRoot}/node_modules`,
    `${monorepoRoot}/packages`,
  ],
  resolver: {
    resolverMainFields: ['main', 'react-native'],
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName.includes('promise/')) {
        return context.resolveRequest(
          {
            ...context,
            // Ensures the promise module is resolved from the sample's node_modules.
            allowHaste: false,
            disableHierarchicalLookup: true,
          },
          moduleName,
          platform,
        );
      }
      return context.resolveRequest(context, moduleName, platform);
    },
    blockList: exclusionList([
      new RegExp('.*\\android\\.*'), // Required for Windows in order to run the Sample.
    ]),
  },
};

const m = mergeConfig(getDefaultConfig(__dirname), config);
module.exports = withSentryConfig(m, {
  annotateReactComponents: true,
});
