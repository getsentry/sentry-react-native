import * as path from 'path';
import * as fs from 'fs';
import { MetroConfig, Module } from 'metro';
import { createSet, VirtualJSOutput } from './utils';
// eslint-disable-next-line import/no-extraneous-dependencies
import * as countLines from 'metro/src/lib/countLines';

// TODO: move to utils
type MetroCustomSerializer = Required<Required<MetroConfig>['serializer']>['customSerializer'] | undefined;

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
    // We should use the default serializer if non is provided
    // eslint-disable-next-line no-console
    console.error(
      '[@sentry/react-native/metro] `config.serializer.customSerializer` is required to load Sentry options from a file',
    );
    return config;
  }

  const sentryOptionsSerializer: MetroCustomSerializer = (entryPoint, preModules, graph, options) => {
    (preModules as Module[]).push(createSentryOptionsModule(optionsPath));
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

function createSentryOptionsModule(filePath: string): Module<VirtualJSOutput> & { setSource: (code: string) => void } {
  // TODO: handle errors
  const content = fs.readFileSync(filePath, 'utf8');
  const parsedContent = JSON.parse(content);
  const minifiedContent = JSON.stringify(parsedContent);
  let optionsCode = `var __SENTRY_OPTIONS__=${minifiedContent};`;

  return {
    setSource: (code: string) => {
      optionsCode = code;
    },
    dependencies: new Map(),
    getSource: () => Buffer.from(optionsCode),
    inverseDependencies: createSet(),
    path: '__SENTRY_OPTIONS__',
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
