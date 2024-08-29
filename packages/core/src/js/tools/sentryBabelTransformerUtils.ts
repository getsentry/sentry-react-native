import { logger } from '@sentry/utils';
import * as fs from 'fs';
import * as path from 'path';
import * as process from 'process';

import type { BabelTransformer } from './vendor/metro/metroBabelTransformer';

/**
 * Saves default Babel transformer path to the project root.
 */
export function saveDefaultBabelTransformerPath(defaultBabelTransformerPath: string): void {
  try {
    fs.mkdirSync(path.join(process.cwd(), '.sentry'), { recursive: true });
    fs.writeFileSync(getDefaultBabelTransformerPath(), defaultBabelTransformerPath);
    logger.debug('Saved default Babel transformer path');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[Sentry] Failed to save default Babel transformer path:', e);
  }
}

/**
 * Reads default Babel transformer path from the project root.
 */
export function readDefaultBabelTransformerPath(): string | undefined {
  try {
    return fs.readFileSync(getDefaultBabelTransformerPath()).toString();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[Sentry] Failed to read default Babel transformer path:', e);
  }
  return undefined;
}

/**
 * Cleans default Babel transformer path from the project root.
 */
export function cleanDefaultBabelTransformerPath(): void {
  try {
    fs.unlinkSync(getDefaultBabelTransformerPath());
    logger.debug('Cleaned default Babel transformer path');
  } catch (e) {
    // We don't want to fail the build if we can't clean the file
    // eslint-disable-next-line no-console
    console.error('[Sentry] Failed to clean default Babel transformer path:', e);
  }
}

function getDefaultBabelTransformerPath(): string {
  return path.join(process.cwd(), '.sentry/.defaultBabelTransformerPath');
}

/**
 * Loads default Babel transformer from `@react-native/metro-config` -> `@react-native/metro-babel-transformer`.
 */
export function loadDefaultBabelTransformer(): BabelTransformer {
  const defaultBabelTransformerPath = readDefaultBabelTransformerPath();
  if (!defaultBabelTransformerPath) {
    throw new Error('Default Babel Transformer Path not found in `.sentry` directory.');
  }

  logger.debug(`Loading default Babel transformer from ${defaultBabelTransformerPath}`);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require(defaultBabelTransformerPath);
}
