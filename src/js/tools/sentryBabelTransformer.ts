/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

interface CustomTransformOptions {
  [key: string]: unknown;
}

type TransformProfile = 'default' | 'hermes-stable' | 'hermes-canary';

interface BabelTransformerOptions {
  readonly customTransformOptions?: CustomTransformOptions;
  readonly dev: boolean;
  readonly enableBabelRCLookup?: boolean;
  readonly enableBabelRuntime: boolean | string;
  readonly extendsBabelConfigPath?: string;
  readonly experimentalImportSupport?: boolean;
  readonly hermesParser?: boolean;
  readonly hot: boolean;
  readonly minify: boolean;
  readonly unstable_disableES6Transforms?: boolean;
  readonly platform: string | null;
  readonly projectRoot: string;
  readonly publicPath: string;
  readonly unstable_transformProfile?: TransformProfile;
  readonly globalPrefix: string;
}

interface BabelTransformerArgs {
  readonly filename: string;
  readonly options: BabelTransformerOptions;
  readonly plugins?: unknown;
  readonly src: string;
}

interface BabelTransformer {
  transform: (args: BabelTransformerArgs) => {
    ast: unknown;
    metadata: unknown;
  };
  getCacheKey?: () => string;
}
// TODO: Add above to the vendor dir

import componentAnnotatePlugin from '@sentry/babel-plugin-component-annotate';

/**
 *
 */
function createSentryBabelTransformer(): BabelTransformer {
  // TODO: Read default from withSentry options
  const defaultTransformer = loadDefaultBabelTransformer();

  // Using spread operator to avoid any conflicts with the default transformer
  const transform: BabelTransformer['transform'] = (...args) => {
    updateArgs(args[0]);
    return defaultTransformer.transform(...args);
  };

  return {
    ...defaultTransformer,
    transform,
  };
}

function updateArgs(args: BabelTransformerArgs | undefined): void {
  if (!args || typeof args.filename !== 'string' || !Array.isArray(args.plugins)) {
    return undefined;
  }

  if (!args.filename.includes('node_modules')) {
    args.plugins.push(componentAnnotatePlugin);
  }
};

/**
 *
 */
function loadDefaultBabelTransformer(): BabelTransformer {
  // TODO: Add to dev dependencies
  // TODO: Recreate node module resolution logic to avoid picking the hoisted package
  // eslint-disable-next-line @typescript-eslint/no-var-requires, import/no-extraneous-dependencies
  const defaultTransformer = require('@react-native/metro-babel-transformer');
  return defaultTransformer;
}

const sentryBabelTransformer = createSentryBabelTransformer();

// With TS set to `commonjs` this will be translated to `module.exports = sentryBabelTransformer;`
// which will be correctly picked up by Metro
export = sentryBabelTransformer;
