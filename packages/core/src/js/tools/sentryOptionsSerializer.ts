import { logger } from '@sentry/core';
import * as fs from 'fs';
import type { MetroConfig, Module } from 'metro';
// eslint-disable-next-line import/no-extraneous-dependencies
import * as countLines from 'metro/src/lib/countLines';
import * as path from 'path';

import type { MetroCustomSerializer, VirtualJSOutput } from './utils';
import { createSet } from './utils';

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
