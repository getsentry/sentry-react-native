const componentAnnotatePlugin = require('@sentry/babel-plugin-component-annotate');
const defaultTransformer = require('@react-native/metro-babel-transformer');
const fs = require('fs');

const transform = (...args) => {
  if (!args[0].filename.includes('node_modules')) {
    args[0].plugins.push(componentAnnotatePlugin);
  }

  return defaultTransformer.transform(...args);
};

const babelTransformer = {
  ...defaultTransformer,
  transform,
};

module.exports = babelTransformer;
