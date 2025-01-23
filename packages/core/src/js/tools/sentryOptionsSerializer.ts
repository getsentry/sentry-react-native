import * as path from 'path';
import * as fs from 'fs';
import { MetroConfig, Module } from 'metro';
import { createSet, MetroCustomSerializer, VirtualJSOutput } from './utils';
// eslint-disable-next-line import/no-extraneous-dependencies
import * as countLines from 'metro/src/lib/countLines';
import { logger } from '@sentry/core';

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
    // eslint-disable-next-line no-console
    console.error('[@sentry/react-native/metro] Project root is required to load Sentry options from a file');
    return config;
  }

  const optionsPath =
    typeof optionsFile === 'string'
      ? path.join(projectRoot, optionsFile)
      : path.join(projectRoot, DEFAULT_OPTIONS_FILE_NAME);

  const originalSerializer = config.serializer?.customSerializer;
  if (!originalSerializer) {
    // TODO: this works because we set Debug ID serializer in `withSentryDebugId`
    // We should use the default serializer if non is provided, for expo we know there always be a default custom serializer
    // eslint-disable-next-line no-console
    console.error(
      '[@sentry/react-native/metro] `config.serializer.customSerializer` is required to load Sentry options from a file',
    );
    return config;
  }

  const sentryOptionsSerializer: MetroCustomSerializer = (entryPoint, preModules, graph, options) => {
    const sentryOptionsModule = createSentryOptionsModule(optionsPath);
    if (sentryOptionsModule) {
      (preModules as Module[]).push(sentryOptionsModule);
    }
    return originalSerializer(entryPoint, preModules, graph, options);
  };

  return {
    ...config,
    serializer: {
      ...config.serializer,
      customSerializer: sentryOptionsSerializer,
    },
  };
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

  const minifiedContent = JSON.stringify(parsedContent);
  let optionsCode = `var __SENTRY_OPTIONS__=${minifiedContent};`;

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
