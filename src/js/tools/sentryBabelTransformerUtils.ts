import { logger } from '@sentry/utils';
import * as fs from 'fs';
import * as path from 'path';

import type { BabelTransformer } from './vendor/metro/metroBabelTransformer';

/**
 * Saves default Babel transformer path to the project root.
 */
export function saveDefaultBabelTransformerPath(projectRoot: string, defaultBabelTransformerPath: string): void {
  try {
    fs.mkdirSync(path.join(projectRoot, '.sentry'), { recursive: true });
    fs.writeFileSync(getDefaultBabelTransformerPath(projectRoot), defaultBabelTransformerPath);
    logger.debug('Saved default Babel transformer path');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[Sentry] Failed to save default Babel transformer path:', e);
  }
}

/**
 * Reads default Babel transformer path from the project root.
 */
export function readDefaultBabelTransformerPath(projectRoot: string): string | undefined {
  try {
    if (fs.existsSync(getDefaultBabelTransformerPath(projectRoot))) {
      return fs.readFileSync(getDefaultBabelTransformerPath(projectRoot)).toString();
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[Sentry] Failed to read default Babel transformer path:', e);
  }
  return undefined;
}

/**
 * Cleans default Babel transformer path from the project root.
 */
export function cleanDefaultBabelTransformerPath(projectRoot: string): void {
  try {
    if (fs.existsSync(getDefaultBabelTransformerPath(projectRoot))) {
      fs.unlinkSync(getDefaultBabelTransformerPath(projectRoot));
    }
    logger.debug('Cleaned default Babel transformer path');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[Sentry] Failed to clean default Babel transformer path:', e);
  }
}

function getDefaultBabelTransformerPath(from: string): string {
  return path.join(from, '.sentry/.defaultBabelTransformerPath')
}

/**
 * Loads default Babel transformer from `@react-native/metro-config` -> `@react-native/metro-babel-transformer`.
 */
export function loadDefaultBabelTransformer(projectRoot: string): BabelTransformer {
  const defaultBabelTransformerPath = readDefaultBabelTransformerPath(projectRoot);
  if (defaultBabelTransformerPath) {
    logger.debug(`Loading default Babel transformer from ${defaultBabelTransformerPath}`);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(defaultBabelTransformerPath);
  }

  const reactNativeMetroConfigPath = resolveReactNativeMetroConfigPath(projectRoot);
  if (!reactNativeMetroConfigPath) {
    throw new Error('Cannot resolve `@react-native/metro-config` to find `@react-native/metro-babel-transformer`.');
  }

  let defaultTransformerPath: string;
  try {
    defaultTransformerPath = require.resolve('@react-native/metro-babel-transformer', { paths: [reactNativeMetroConfigPath] });
    logger.debug(`Resolved @react-native/metro-babel-transformer to ${defaultTransformerPath}`);
  } catch (e) {
    throw new Error('Cannot load `@react-native/metro-babel-transformer` from `${reactNativeMetroConfig}`.');
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const defaultTransformer = require(defaultTransformerPath);
  return defaultTransformer;
}

/**
 * Checks current environment and installed dependencies to determine if Sentry Babel transformer can be used.
 */
export function canUseSentryBabelTransformer(projectRoot?: string): boolean {
  return !!resolveReactNativeMetroConfigPath(projectRoot);
}

/**
 * Resolves path to the installed `@react-native/metro-config` package.
 * Available since React Native 0.72
 */
function resolveReactNativeMetroConfigPath(projectRoot?: string): string | undefined {
  try {
    const p = require.resolve('@react-native/metro-config', projectRoot ? { paths: [projectRoot] } : undefined);
    logger.debug(`Resolved @react-native/metro-config to ${p}`);
    return p;
  } catch (e) {
    // return undefined;
  }
  logger.debug('Failed to resolve @react-native/metro-config');
  return undefined;
}
