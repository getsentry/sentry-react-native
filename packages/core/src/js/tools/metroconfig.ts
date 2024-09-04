import { logger } from '@sentry/utils';
import type { MixedOutput, Module, ReadOnlyGraph } from 'metro';
import type { MetroConfig } from 'metro-config';
import * as process from 'process';
import { env } from 'process';

import { enableLogger } from './enableLogger';
import { cleanDefaultBabelTransformerPath, saveDefaultBabelTransformerPath } from './sentryBabelTransformerUtils';
import { createSentryMetroSerializer, unstable_beforeAssetSerializationPlugin } from './sentryMetroSerializer';
import type { DefaultConfigOptions } from './vendor/expo/expoconfig';

export * from './sentryMetroSerializer';

enableLogger();

export interface SentryMetroConfigOptions {
  /**
   * Annotates React components with Sentry data.
   * @default false
   */
  annotateReactComponents?: boolean;
}

export interface SentryExpoConfigOptions {
  /**
   * Pass a custom `getDefaultConfig` function to override the default Expo configuration getter.
   */
  getDefaultConfig?: typeof getSentryExpoConfig;
}

/**
 * Adds Sentry to the Metro config.
 *
 * Adds Debug ID to the output bundle and source maps.
 * Collapses Sentry frames from the stack trace view in LogBox.
 */
export function withSentryConfig(
  config: MetroConfig,
  { annotateReactComponents = false }: SentryMetroConfigOptions = {},
): MetroConfig {
  setSentryMetroDevServerEnvFlag();

  let newConfig = config;

  newConfig = withSentryDebugId(newConfig);
  newConfig = withSentryFramesCollapsed(newConfig);
  if (annotateReactComponents) {
    newConfig = withSentryBabelTransformer(newConfig);
  }

  return newConfig;
}

/**
 * This function returns Default Expo configuration with Sentry plugins.
 */
export function getSentryExpoConfig(
  projectRoot: string,
  options: DefaultConfigOptions & SentryExpoConfigOptions & SentryMetroConfigOptions = {},
): MetroConfig {
  setSentryMetroDevServerEnvFlag();

  const getDefaultConfig = options.getDefaultConfig || loadExpoMetroConfigModule().getDefaultConfig;
  const config = getDefaultConfig(projectRoot, {
    ...options,
    unstable_beforeAssetSerializationPlugins: [
      ...(options.unstable_beforeAssetSerializationPlugins || []),
      unstable_beforeAssetSerializationPlugin,
    ],
  });

  let newConfig = withSentryFramesCollapsed(config);
  if (options.annotateReactComponents) {
    newConfig = withSentryBabelTransformer(newConfig);
  }

  return newConfig;
}

function loadExpoMetroConfigModule(): {
  getDefaultConfig: (
    projectRoot: string,
    options: {
      unstable_beforeAssetSerializationPlugins?: ((serializationInput: {
        graph: ReadOnlyGraph<MixedOutput>;
        premodules: Module[];
        debugId?: string;
      }) => Module[])[];
    },
  ) => MetroConfig;
} {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo/metro-config');
  } catch (e) {
    throw new Error('Unable to load `expo/metro-config`. Make sure you have Expo installed.');
  }
}

/**
 * Adds Sentry Babel transformer to the Metro config.
 */
export function withSentryBabelTransformer(config: MetroConfig): MetroConfig {
  const defaultBabelTransformerPath = config.transformer && config.transformer.babelTransformerPath;
  logger.debug('Default Babel transformer path from `config.transformer`:', defaultBabelTransformerPath);

  if (!defaultBabelTransformerPath) {
    // This has to be console.warn because the options is enabled but won't be used
    // eslint-disable-next-line no-console
    console.warn('`transformer.babelTransformerPath` is undefined.');
    // eslint-disable-next-line no-console
    console.warn('Sentry Babel transformer cannot be used. Not adding it...');
    return config;
  }

  if (defaultBabelTransformerPath) {
    saveDefaultBabelTransformerPath(defaultBabelTransformerPath);
    process.on('exit', () => {
      cleanDefaultBabelTransformerPath();
    });
  }

  return {
    ...config,
    transformer: {
      ...config.transformer,
      babelTransformerPath: require.resolve('./sentryBabelTransformer'),
    },
  };
}

type MetroCustomSerializer = Required<Required<MetroConfig>['serializer']>['customSerializer'] | undefined;

function withSentryDebugId(config: MetroConfig): MetroConfig {
  const customSerializer = createSentryMetroSerializer(
    config.serializer?.customSerializer || undefined,
  ) as MetroCustomSerializer;
  // MetroConfig types customSerializers as async only, but sync returns are also supported
  // The default serializer is sync

  return {
    ...config,
    serializer: {
      ...config.serializer,
      customSerializer,
    },
  };
}

type MetroFrame = Parameters<Required<Required<MetroConfig>['symbolicator']>['customizeFrame']>[0];
type MetroCustomizeFrame = { readonly collapse?: boolean };
type MetroCustomizeFrameReturnValue =
  | ReturnType<Required<Required<MetroConfig>['symbolicator']>['customizeFrame']>
  | undefined;

/**
 * Collapses Sentry internal frames from the stack trace view in LogBox.
 */
export function withSentryFramesCollapsed(config: MetroConfig): MetroConfig {
  const originalCustomizeFrame = config.symbolicator?.customizeFrame;
  const collapseSentryInternalFrames = (frame: MetroFrame): boolean =>
    typeof frame.file === 'string' &&
    (frame.file.includes('node_modules/@sentry/utils/cjs/instrument.js') ||
      frame.file.includes('node_modules/@sentry/utils/cjs/logger.js'));

  const customizeFrame = (frame: MetroFrame): MetroCustomizeFrameReturnValue => {
    const originalOrSentryCustomizeFrame = (
      originalCustomization: MetroCustomizeFrame | undefined,
    ): MetroCustomizeFrame => ({
      ...originalCustomization,
      collapse: (originalCustomization && originalCustomization.collapse) || collapseSentryInternalFrames(frame),
    });

    const maybePromiseCustomization = (originalCustomizeFrame && originalCustomizeFrame(frame)) || undefined;

    if (maybePromiseCustomization !== undefined && 'then' in maybePromiseCustomization) {
      return maybePromiseCustomization.then<MetroCustomizeFrame>(originalCustomization =>
        originalOrSentryCustomizeFrame(originalCustomization),
      );
    }

    return originalOrSentryCustomizeFrame(maybePromiseCustomization);
  };

  return {
    ...config,
    symbolicator: {
      ...config.symbolicator,
      customizeFrame,
    },
  };
}

/**
 * Sets the `___SENTRY_METRO_DEV_SERVER___` environment flag.
 * This is used to determine if the SDK is running in Node in Metro Dev Server.
 * For example during static routes generation in `expo-router`.
 */
function setSentryMetroDevServerEnvFlag(): void {
  env.___SENTRY_METRO_DEV_SERVER___ = 'true';
}
