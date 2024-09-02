const path = require('path');
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
 * Metro configuration for React Native
 * https://github.com/facebook/react-native
 *
 * @format
 */
module.exports = {
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
  projectRoot: __dirname,
  // 1. Watch the local app directory, and only the shared packages (limiting the scope and speeding it up)
  // Note how we change this from `monorepoRoot` to `projectRoot`. This is part of the optimization!
  watchFolders: [projectRoot, ...Object.values(monorepoPackages)],
  resolver: {
    blockList: exclusionList([
      ...Object.values(monorepoPackages).map(p => new RegExp(`${p}/node_modules/react-native/.*`)),
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
      ...Object.values(monorepoPackages).map(p => path.resolve(p, 'node_modules')),
    ],
  },
};
