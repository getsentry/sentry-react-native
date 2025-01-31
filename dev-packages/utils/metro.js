const path = require('path');
const exclusionList = require('metro-config/src/defaults/exclusionList');

/**
 * Packages used by the sample apps
 */
const getMonorepoPackages = monorepoRoot => {
  return {
    '@sentry/react-native': path.resolve(monorepoRoot, 'packages/core'),
  };
};

/**
 * Block given packages present in the monorepo packages to avoid conflicts with the sample apps
 */
const getBlockList = (monorepoPackages, excludedPackages) => {
  return Object.values(monorepoPackages)
    .map(p => excludedPackages.map(e => new RegExp(`${p}/node_modules/${e}/.*`)))
    .flat();
};

const withMonorepo = config => {
  const projectRoot = config.projectRoot;
  if (!projectRoot) {
    throw new Error('projectRoot is required');
  }

  const monorepoRoot = path.resolve(projectRoot, '../..');
  const monorepoPackages = getMonorepoPackages(monorepoRoot);

  config.resolver = config.resolver || {};

  const blockList = [
    ...((Array.isArray(config.resolver.blockList) && config.resolver.blockList) ||
      (!!config.resolver.blockList && [config.resolver.blockList]) ||
      []),
    ...getBlockList(monorepoPackages, ['react-native', 'react']),
    new RegExp('.*\\android\\.*'), // Required for Windows in order to run the Sample.
  ];
  config.resolver.blockList = exclusionList(blockList);

  config.watchFolders = [...(config.watchFolders || []), projectRoot, ...Object.values(monorepoPackages)];

  config.resolver.extraNodeModules = {
    ...config.resolver.extraNodeModules,
    ...monorepoPackages,
    'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
    react: path.resolve(projectRoot, 'node_modules/react'),
  };

  config.resolver.nodeModulesPaths = [
    ...(config.resolver.nodeModulesPaths || []),
    path.resolve(projectRoot, 'node_modules'),
    ...Object.values(monorepoPackages).map(p => path.resolve(p, 'node_modules')),
  ];

  return config;
};

module.exports = {
  withMonorepo,
};
