import type { MetroConfig, Module, ReadOnlyGraph, SerializerOptions } from 'metro';

import { logger } from '@sentry/core';
import * as fs from 'fs';
import * as path from 'path';

import type { MetroCustomSerializer, VirtualJSOutput } from './utils';

import { createSet } from './utils';
import countLines from './vendor/metro/countLines';

const DEFAULT_OPTIONS_FILE_NAME = 'sentry.options.json';

/**
 * Loads Sentry options from a file in
 */
export function withSentryOptionsFromFile(config: MetroConfig, optionsFile: string | boolean): MetroConfig {
  if (optionsFile === false) {
    return config;
  }

  const { projectRoot } = config;
  if (!projectRoot) {
    // oxlint-disable-next-line eslint(no-console)
    console.error('[@sentry/react-native/metro] Project root is required to load Sentry options from a file');
    return config;
  }

  let optionsPath = path.join(projectRoot, DEFAULT_OPTIONS_FILE_NAME);
  if (typeof optionsFile === 'string' && path.isAbsolute(optionsFile)) {
    optionsPath = optionsFile;
  } else if (typeof optionsFile === 'string') {
    optionsPath = path.join(projectRoot, optionsFile);
  }

  const originalSerializer = config.serializer?.customSerializer;
  if (!originalSerializer) {
    // It's okay to bail here because we don't expose this for direct usage, but as part of `withSentryConfig`
    // If used directly in RN, the user is responsible for providing a custom serializer first, Expo provides serializer in default config
    // oxlint-disable-next-line eslint(no-console)
    console.error(
      '[@sentry/react-native/metro] `config.serializer.customSerializer` is required to load Sentry options from a file',
    );
    return config;
  }

  const sentryOptionsSerializer: MetroCustomSerializer = (
    entryPoint: string,
    preModules: readonly Module[],
    graph: ReadOnlyGraph,
    options: SerializerOptions,
  ) => {
    const sentryOptionsModule = createSentryOptionsModule(optionsPath);
    if (sentryOptionsModule) {
      (preModules as Module[]).push(sentryOptionsModule);
    }
    return originalSerializer(entryPoint, preModules, graph, options);
  };

  // Preserve Expo's __originalSerializer marker so Expo can detect user-provided serializers
  if ('__originalSerializer' in originalSerializer) {
    Object.assign(sentryOptionsSerializer, {
      __originalSerializer: (originalSerializer as Record<string, unknown>).__originalSerializer,
    });
  }

  // @ts-expect-error customSerializer is typed read only in metro 0.84+
  config.serializer.customSerializer = sentryOptionsSerializer;
  return config;
}

function createSentryOptionsModule(filePath: string): Module<VirtualJSOutput> | null {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.debug(`[@sentry/react-native/metro] Sentry options file does not exist at ${filePath}`);
    } else {
      logger.error(`[@sentry/react-native/metro] Failed to read Sentry options file at ${filePath}`);
    }
    return null;
  }

  let parsedContent: Record<string, unknown>;
  try {
    parsedContent = JSON.parse(content);
  } catch (error) {
    logger.error(`[@sentry/react-native/metro] Failed to parse Sentry options file at ${filePath}`);
    return null;
  }

  applySentryOptionsEnvOverrides(parsedContent);

  const minifiedContent = JSON.stringify(parsedContent);
  const optionsCode = `var __SENTRY_OPTIONS__=${minifiedContent};`;

  logger.debug(`[@sentry/react-native/metro] Sentry options added to the bundle from file at ${filePath}`);
  return {
    dependencies: new Map(),
    getSource: () => Buffer.from(optionsCode),
    inverseDependencies: createSet(),
    path: '__sentry-options__',
    output: [
      {
        type: 'js/script/virtual',
        data: {
          code: optionsCode,
          lineCount: countLines(optionsCode),
          map: [],
        },
      },
    ],
  };
}

/**
 * Applies the `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE` and `SENTRY_DIST` build-time overrides to the
 * options bundled into the JS (`__SENTRY_OPTIONS__`).
 *
 * The native build steps (`sentry-xcode.sh`, `sentry.gradle.kts`) already apply these env variables
 * to the native copy of `sentry.options.json`. Without mirroring them here, the native SDK (which owns
 * release health sessions on mobile) and the JS layer can end up with a different `environment`,
 * `release` or `dist`, splitting session and event data across releases/environments.
 */
function applySentryOptionsEnvOverrides(options: Record<string, unknown>): void {
  // The options file is expected to contain a JSON object. Guard against valid-but-unexpected JSON
  // (e.g. a primitive or `null`), where assigning a property would throw in strict mode.
  if (typeof options !== 'object' || options === null) {
    return;
  }
  if (process.env.SENTRY_ENVIRONMENT) {
    options.environment = process.env.SENTRY_ENVIRONMENT;
    logger.debug(`[@sentry/react-native/metro] Overriding 'environment' from SENTRY_ENVIRONMENT environment variable`);
  }
  if (process.env.SENTRY_RELEASE) {
    options.release = process.env.SENTRY_RELEASE;
    logger.debug(`[@sentry/react-native/metro] Overriding 'release' from SENTRY_RELEASE environment variable`);
  }
  if (process.env.SENTRY_DIST) {
    options.dist = process.env.SENTRY_DIST;
    logger.debug(`[@sentry/react-native/metro] Overriding 'dist' from SENTRY_DIST environment variable`);
  }
}
