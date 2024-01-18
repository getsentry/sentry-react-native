import type { MetroConfig, MixedOutput, Module, ReadOnlyGraph } from 'metro';

import { createSentryMetroSerializer, unstable_beforeAssetSerializationPlugin } from './sentryMetroSerializer';
import type { DefaultConfigOptions } from './vendor/expo/expoconfig';

export * from './sentryMetroSerializer';

/**
 * Adds Sentry to the Metro config.
 *
 * Adds Debug ID to the output bundle and source maps.
 * Collapses Sentry frames from the stack trace view in LogBox.
 */
export function withSentryConfig(config: MetroConfig): MetroConfig {
  let newConfig = config;

  newConfig = withSentryDebugId(newConfig);
  newConfig = withSentryFramesCollapsed(newConfig);

  return newConfig;
}

/**
 * This function returns Default Expo configuration with Sentry plugins.
 */
export function getSentryExpoConfig(projectRoot: string, options: DefaultConfigOptions = {}): MetroConfig {
  const { getDefaultConfig } = loadExpoMetroConfigModule();
  const config = getDefaultConfig(projectRoot, {
    ...options,
    unstable_beforeAssetSerializationPlugins: [
      ...(options.unstable_beforeAssetSerializationPlugins || []),
      unstable_beforeAssetSerializationPlugin,
    ],
  });

  return withSentryFramesCollapsed(config);
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

function withSentryFramesCollapsed(config: MetroConfig): MetroConfig {
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
