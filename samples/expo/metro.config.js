// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('@expo/metro-config');
const path = require('path');

const { getSentryExpoConfig } = require('@sentry/react-native/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getSentryExpoConfig(__dirname, {
  // [Web-only]: Enables CSS support in Metro.
  isCSSEnabled: true,
  getDefaultConfig,
  annotateReactComponents: true,
});

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

// Only list the packages within your monorepo that your app uses. No need to add anything else.
// If your monorepo tooling can give you the list of monorepo workspaces linked
// in your app workspace, you can automate this list instead of hardcoding them.
const monorepoPackages = {
  '@sentry/react-native': path.resolve(monorepoRoot, 'packages/core'),
};

const exclusionList = [...Object.values(monorepoPackages).map(p => new RegExp(`${p}/node_modules/react-native/.*`))];

if (config.resolver.blacklistRE) {
  config.resolver.blacklistRE.push(...exclusionList);
} else {
  config.resolver.blacklistRE = exclusionList;
}

// 1. Watch the local app directory, and only the shared packages (limiting the scope and speeding it up)
// Note how we change this from `monorepoRoot` to `projectRoot`. This is part of the optimization!
config.watchFolders = [projectRoot, ...Object.values(monorepoPackages)];

// Add the monorepo workspaces as `extraNodeModules` to Metro.
// If your monorepo tooling creates workspace symlinks in the `node_modules` directory,
// you can either add symlink support to Metro or set the `extraNodeModules` to avoid the symlinks.
// See: https://metrobundler.dev/docs/configuration/#extranodemodules
config.resolver.extraNodeModules = {
  ...monorepoPackages,
  'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
};

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  ...Object.values(monorepoPackages).map(p => path.resolve(p, 'node_modules')),
];

module.exports = config;
