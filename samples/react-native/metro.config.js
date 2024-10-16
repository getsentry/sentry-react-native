const path = require('path');
const { withSentryConfig } = require('@sentry/react-native/metro');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const exclusionList = require('metro-config/src/defaults/exclusionList');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

// Only list the packages within your monorepo that your app uses. No need to add anything else.
// If your monorepo tooling can give you the list of monorepo workspaces linked
// in your app workspace, you can automate this list instead of hardcoding them.
const monorepoPackages = {
  '@sentry/react-native': path.resolve(monorepoRoot, 'packages/core'),
};

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  projectRoot: __dirname,
  // 1. Watch the local app directory, and only the shared packages (limiting the scope and speeding it up)
  // Note how we change this from `monorepoRoot` to `projectRoot`. This is part of the optimization!
  watchFolders: [projectRoot, ...Object.values(monorepoPackages)],
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
      ...Object.values(monorepoPackages).map(
        p => new RegExp(`${p}/node_modules/react-native/.*`),
      ),
    ]),
    // Add the monorepo workspaces as `extraNodeModules` to Metro.
    // If your monorepo tooling creates workspace symlinks in the `node_modules` directory,
    // you can either add symlink support to Metro or set the `extraNodeModules` to avoid the symlinks.
    // See: https://metrobundler.dev/docs/configuration/#extranodemodules
    extraNodeModules: {
      ...monorepoPackages,
      'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
    },
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      ...Object.values(monorepoPackages).map(p =>
        path.resolve(p, 'node_modules'),
      ),
    ],
  },
};

const m = mergeConfig(getDefaultConfig(__dirname), config);
module.exports = withSentryConfig(m, {
  annotateReactComponents: true,
});
