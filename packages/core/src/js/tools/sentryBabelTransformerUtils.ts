import componentAnnotatePlugin from '@sentry/babel-plugin-component-annotate';
import { logger } from '@sentry/core';
import * as process from 'process';

import type { BabelTransformer, BabelTransformerArgs } from './vendor/metro/metroBabelTransformer';

export type SentryBabelTransformerOptions = { annotateReactComponents?: { ignoredComponents?: string[] } };

export const SENTRY_DEFAULT_BABEL_TRANSFORMER_PATH = 'SENTRY_DEFAULT_BABEL_TRANSFORMER_PATH';
export const SENTRY_BABEL_TRANSFORMER_OPTIONS = 'SENTRY_BABEL_TRANSFORMER_OPTIONS';

/**
 * Sets default Babel transformer path to the environment variables.
 */
export function setSentryDefaultBabelTransformerPathEnv(defaultBabelTransformerPath: string): void {
  process.env[SENTRY_DEFAULT_BABEL_TRANSFORMER_PATH] = defaultBabelTransformerPath;
  logger.debug(`Saved default Babel transformer path ${defaultBabelTransformerPath}`);
}

/**
 * Reads default Babel transformer path from the environment variables.
 */
export function getSentryDefaultBabelTransformerPathEnv(): string | undefined {
  return process.env[SENTRY_DEFAULT_BABEL_TRANSFORMER_PATH];
}

/**
 * Loads default Babel transformer from `@react-native/metro-config` -> `@react-native/metro-babel-transformer`.
 */
export function loadDefaultBabelTransformer(): BabelTransformer {
  const defaultBabelTransformerPath = getSentryDefaultBabelTransformerPathEnv();
  if (!defaultBabelTransformerPath) {
    throw new Error(
      `Default Babel transformer path environment variable ${SENTRY_DEFAULT_BABEL_TRANSFORMER_PATH} is not set.`,
    );
  }

  logger.debug(`Loading default Babel transformer from ${defaultBabelTransformerPath}`);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require(defaultBabelTransformerPath);
}

/**
 *
 */
export function setSentryBabelTransformerOptions(options: SentryBabelTransformerOptions): void {
  let optionsString: string | null = null;
  try {
    logger.debug(`Stringifying Sentry Babel transformer options`, options);
    optionsString = JSON.stringify(options);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Failed to stringify Sentry Babel transformer options', e);
  }

  if (!optionsString) {
    return;
  }

  logger.debug(`Sentry Babel transformer options set to ${SENTRY_BABEL_TRANSFORMER_OPTIONS}`, optionsString);
  process.env[SENTRY_BABEL_TRANSFORMER_OPTIONS] = optionsString;
}

/**
 *
 */
export function getSentryBabelTransformerOptions(): SentryBabelTransformerOptions | undefined {
  const optionsString = process.env[SENTRY_BABEL_TRANSFORMER_OPTIONS];
  if (!optionsString) {
    logger.debug(
      `Sentry Babel transformer options environment variable ${SENTRY_BABEL_TRANSFORMER_OPTIONS} is not set`,
    );
    return undefined;
  }

  try {
    logger.debug(`Parsing Sentry Babel transformer options from ${optionsString}`);
    return JSON.parse(optionsString);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Failed to parse Sentry Babel transformer options', e);
    return undefined;
  }
}

/**
 * Creates a Babel transformer with Sentry component annotation plugin.
 */
export function createSentryBabelTransformer(): BabelTransformer {
  const defaultTransformer = loadDefaultBabelTransformer();
  const options = getSentryBabelTransformerOptions();

  // Using spread operator to avoid any conflicts with the default transformer
  const transform: BabelTransformer['transform'] = (...args) => {
    const transformerArgs = args[0];

    addSentryComponentAnnotatePlugin(transformerArgs, options?.annotateReactComponents);

    return defaultTransformer.transform(...args);
  };

  return {
    ...defaultTransformer,
    transform,
  };
}

function addSentryComponentAnnotatePlugin(
  args: BabelTransformerArgs | undefined,
  options: SentryBabelTransformerOptions['annotateReactComponents'] | undefined,
): void {
  if (!args || typeof args.filename !== 'string' || !Array.isArray(args.plugins)) {
    return undefined;
  }

  if (!args.filename.includes('node_modules')) {
    if (options) {
      args.plugins.push([componentAnnotatePlugin, options]);
    } else {
      args.plugins.push(componentAnnotatePlugin);
    }
  }
}
