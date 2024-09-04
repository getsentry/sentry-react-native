import componentAnnotatePlugin from '@sentry/babel-plugin-component-annotate';

import { enableLogger } from './enableLogger';
import { loadDefaultBabelTransformer } from './sentryBabelTransformerUtils';
import type { BabelTransformer, BabelTransformerArgs } from './vendor/metro/metroBabelTransformer';

enableLogger();

/**
 * Creates a Babel transformer with Sentry component annotation plugin.
 */
function createSentryBabelTransformer(): BabelTransformer {
  const defaultTransformer = loadDefaultBabelTransformer();

  // Using spread operator to avoid any conflicts with the default transformer
  const transform: BabelTransformer['transform'] = (...args) => {
    const transformerArgs = args[0];

    addSentryComponentAnnotatePlugin(transformerArgs);

    return defaultTransformer.transform(...args);
  };

  return {
    ...defaultTransformer,
    transform,
  };
}

function addSentryComponentAnnotatePlugin(args: BabelTransformerArgs | undefined): void {
  if (!args || typeof args.filename !== 'string' || !Array.isArray(args.plugins)) {
    return undefined;
  }

  if (!args.filename.includes('node_modules')) {
    args.plugins.push(componentAnnotatePlugin);
  }
}

const sentryBabelTransformer = createSentryBabelTransformer();
// With TS set to `commonjs` this will be translated to `module.exports = sentryBabelTransformer;`
// which will be correctly picked up by Metro
export = sentryBabelTransformer;
