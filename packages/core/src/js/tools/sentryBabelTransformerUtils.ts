import { logger } from '@sentry/core';
import * as process from 'process';

import type { BabelTransformer } from './vendor/metro/metroBabelTransformer';

export const SENTRY_DEFAULT_BABEL_TRANSFORMER_PATH = 'SENTRY_DEFAULT_BABEL_TRANSFORMER_PATH';

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
