import type { MetroConfig, MixedOutput, Module, ReadOnlyGraph } from 'metro';
import type { CustomResolutionContext, CustomResolver, Resolution } from 'metro-resolver';

import { debug } from '@sentry/core';
import * as process from 'process';
import { env } from 'process';

import type { MetroCustomSerializer } from './utils';
import type { DefaultConfigOptions } from './vendor/expo/expoconfig';

import { enableLogger } from './enableLogger';
import { withSentryMiddleware } from './metroMiddleware';
import { checkSentryExpoNativeProject } from './sentryExpoNativeCheck';
import {
  setSentryBabelTransformerOptions,
  setSentryDefaultBabelTransformerPathEnv,
} from './sentryBabelTransformerUtils';
import { createSentryMetroSerializer, unstableBeforeAssetSerializationDebugIdPlugin } from './sentryMetroSerializer';
import { withSentryOptionsFromFile } from './sentryOptionsSerializer';
import { unstableReleaseConstantsPlugin } from './sentryReleaseInjector';

export * from './sentryMetroSerializer';

enableLogger();

export interface SentryMetroConfigOptions {
  /**
   * Annotates React components with Sentry data.
   * @default false
   */
  annotateReactComponents?:
    | boolean
    | {
        ignoredComponents?: string[];
      };
  /**
   * Adds the Sentry replay package for web.
   * @default true
   */
  includeWebReplay?: boolean;
  /**
   * Add Sentry Metro Server Middleware which
   * enables the app to fetch stack frames source context.
   * @default true
   */
  enableSourceContextInDevelopment?: boolean;
  /**
   * Load Sentry Options from a file. If `true` it will use the default path.
   * If `false` it will not load any options from a file. Only options provided in the code will be used.
   * If `string` it will use the provided path.
   *
   * @default '{projectRoot}/sentry.options.json'
   */
  optionsFile?: string | boolean;
}

export interface SentryExpoConfigOptions {
  /**
   * Pass a custom `getDefaultConfig` function to override the default Expo configuration getter.
   */
  getDefaultConfig?: (projectRoot: string, options?: Record<string, unknown>) => Record<string, unknown>;

  /**
   * For Expo Web, inject `release` and `version` options from `app.json`, the Expo Application Config.
   *
   * @default true
   */
  injectReleaseForWeb?: boolean;
}

/**
 * Adds Sentry to the Metro config.
 *
 * Adds Debug ID to the output bundle and source maps.
 * Collapses Sentry frames from the stack trace view in LogBox.
 */
export function withSentryConfig(
  config: MetroConfig,
  {
    annotateReactComponents = false,
    includeWebReplay = true,
    enableSourceContextInDevelopment = true,
    optionsFile = true,
  }: SentryMetroConfigOptions = {},
): MetroConfig {
  setSentryMetroDevServerEnvFlag();

  let newConfig = config;

  newConfig = withSentryDebugId(newConfig);
  newConfig = withSentryFramesCollapsed(newConfig);
  if (annotateReactComponents) {
    newConfig = withSentryBabelTransformer(newConfig, annotateReactComponents);
  }
  if (includeWebReplay === false) {
    newConfig = withSentryResolver(newConfig, includeWebReplay);
  }
  newConfig = withSentryExcludeServerOnlyResolver(newConfig);
  if (enableSourceContextInDevelopment) {
    newConfig = withSentryMiddleware(newConfig);
  }
  if (optionsFile) {
    newConfig = withSentryOptionsFromFile(newConfig, optionsFile);
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

  checkSentryExpoNativeProject(projectRoot);

  const getDefaultConfig = options.getDefaultConfig || loadExpoMetroConfigModule().getDefaultConfig;
  const config = getDefaultConfig(projectRoot, {
    ...options,
    unstable_beforeAssetSerializationPlugins: [
      ...(options.unstable_beforeAssetSerializationPlugins || []),
      ...((options.injectReleaseForWeb ?? true) ? [unstableReleaseConstantsPlugin(projectRoot)] : []),
      unstableBeforeAssetSerializationDebugIdPlugin,
    ],
  });

  let newConfig = withSentryFramesCollapsed(config);
  if (options.annotateReactComponents) {
    newConfig = withSentryBabelTransformer(newConfig, options.annotateReactComponents);
  }

  if (options.includeWebReplay === false) {
    newConfig = withSentryResolver(newConfig, options.includeWebReplay);
  }
  newConfig = withSentryExcludeServerOnlyResolver(newConfig);

  if (options.enableSourceContextInDevelopment ?? true) {
    newConfig = withSentryMiddleware(newConfig);
  }

  if (options.optionsFile ?? true) {
    newConfig = withSentryOptionsFromFile(newConfig, options.optionsFile ?? true);
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
    return require('expo/metro-config');
  } catch (e) {
    throw new Error('Unable to load `expo/metro-config`. Make sure you have Expo installed.');
  }
}

/**
 * Adds Sentry Babel transformer to the Metro config.
 */
export function withSentryBabelTransformer(
  config: MetroConfig,
  annotateReactComponents: true | { ignoredComponents?: string[] },
): MetroConfig {
  const defaultBabelTransformerPath = config.transformer?.babelTransformerPath;
  debug.log('Default Babel transformer path from `config.transformer`:', defaultBabelTransformerPath);

  if (!defaultBabelTransformerPath) {
    // This has to be console.warn because the options is enabled but won't be used
    // oxlint-disable-next-line eslint(no-console)
    console.warn('`transformer.babelTransformerPath` is undefined.');
    // oxlint-disable-next-line eslint(no-console)
    console.warn('Sentry Babel transformer cannot be used. Not adding it...');
    return config;
  }

  if (defaultBabelTransformerPath) {
    setSentryDefaultBabelTransformerPathEnv(defaultBabelTransformerPath);
  }

  if (typeof annotateReactComponents === 'object') {
    setSentryBabelTransformerOptions({
      annotateReactComponents,
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

// Based on: https://github.com/facebook/metro/blob/c21daba415ea26511e157f794689caab9abe8236/packages/metro-resolver/src/resolve.js#L86-L91
type CustomResolverBeforeMetro068 = (
  context: CustomResolutionContext,
  realModuleName: string,
  platform: string | null,
  moduleName?: string,
) => Resolution;

/**
 * Includes `@sentry/replay` packages based on the `includeWebReplay` flag and current bundle `platform`.
 */
export function withSentryResolver(config: MetroConfig, includeWebReplay: boolean | undefined): MetroConfig {
  const originalResolver = config.resolver?.resolveRequest as CustomResolver | CustomResolverBeforeMetro068 | undefined;

  const sentryResolverRequest: CustomResolver = (
    context: CustomResolutionContext,
    moduleName: string,
    platform: string | null,
    oldMetroModuleName?: string,
  ) => {
    if (
      (includeWebReplay === false ||
        (includeWebReplay === undefined && (platform === 'android' || platform === 'ios'))) &&
      !!(oldMetroModuleName ?? moduleName).match(/@sentry(?:-internal)?\/replay/)
    ) {
      return { type: 'empty' } as Resolution;
    }
    if (originalResolver) {
      return oldMetroModuleName
        ? originalResolver(context, moduleName, platform, oldMetroModuleName)
        : originalResolver(context, moduleName, platform);
    }

    // Prior 0.68, resolve context.resolveRequest is sentryResolver itself, where on later version it is the default resolver.
    if (context.resolveRequest === sentryResolverRequest) {
      // oxlint-disable-next-line eslint(no-console)
      console.error(
        `Error: [@sentry/react-native/metro] Can not resolve the defaultResolver on Metro older than 0.68.
Please follow one of the following options:
- Include your resolverRequest on your metroconfig.
- Update your Metro version to 0.68 or higher.
- Set includeWebReplay as true on your metro config.
- If you are still facing issues, report the issue at http://www.github.com/getsentry/sentry-react-native/issues`,
      );
      // Return required for test.
      return process.exit(-1);
    }

    return context.resolveRequest(context, moduleName, platform);
  };

  return {
    ...config,
    resolver: {
      ...config.resolver,
      resolveRequest: sentryResolverRequest,
    },
  };
}

/**
 * Matches relative import paths to server-only AI/MCP modules within `@sentry/core`.
 *
 * Metro passes the module name as-written in the source code, so for imports inside
 * `@sentry/core`'s barrel file like `export { ... } from './integrations/mcp-server/index.js'`,
 * the `moduleName` will be `./integrations/mcp-server/index.js`.
 */
const SERVER_ONLY_MODULE_RE =
  /\/(mcp-server|tracing\/(vercel-ai|openai|anthropic-ai|google-genai|langchain|langgraph)|utils\/ai)(\/|$)/;

function isFromSentryCore(originModulePath: string): boolean {
  return originModulePath.includes('@sentry/core');
}

/**
 * Excludes server-only AI/MCP modules from native (Android/iOS) bundles.
 */
export function withSentryExcludeServerOnlyResolver(config: MetroConfig): MetroConfig {
  const originalResolver = config.resolver?.resolveRequest as CustomResolver | CustomResolverBeforeMetro068 | undefined;

  const sentryServerOnlyResolverRequest: CustomResolver = (
    context: CustomResolutionContext,
    moduleName: string,
    platform: string | null,
    oldMetroModuleName?: string,
  ) => {
    if (
      (platform === 'android' || platform === 'ios') &&
      isFromSentryCore((context as { originModulePath?: string }).originModulePath ?? '') &&
      SERVER_ONLY_MODULE_RE.test(oldMetroModuleName ?? moduleName)
    ) {
      return { type: 'empty' } as Resolution;
    }
    if (originalResolver) {
      return oldMetroModuleName
        ? originalResolver(context, moduleName, platform, oldMetroModuleName)
        : originalResolver(context, moduleName, platform);
    }

    // Prior 0.68, context.resolveRequest is sentryServerOnlyResolverRequest itself, which would cause infinite recursion.
    if (context.resolveRequest === sentryServerOnlyResolverRequest) {
      // oxlint-disable-next-line eslint(no-console)
      console.error(
        `Error: [@sentry/react-native/metro] Can not resolve the defaultResolver on Metro older than 0.68.
Please include your resolverRequest on your metroconfig or update your Metro version to 0.68 or higher.
If you are still facing issues, report the issue at http://www.github.com/getsentry/sentry-react-native/issues`,
      );
      // Return required for test.
      return process.exit(-1);
    }

    return context.resolveRequest(context, moduleName, platform);
  };

  return {
    ...config,
    resolver: {
      ...config.resolver,
      resolveRequest: sentryServerOnlyResolverRequest,
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
    (frame.file.includes('node_modules/@sentry/core/cjs/instrument.js') ||
      frame.file.includes('node_modules/@sentry/core/cjs/debug.js'));

  const customizeFrame = (frame: MetroFrame): MetroCustomizeFrameReturnValue => {
    const originalOrSentryCustomizeFrame = (
      originalCustomization: MetroCustomizeFrame | undefined,
    ): MetroCustomizeFrame => ({
      ...originalCustomization,
      collapse: originalCustomization?.collapse || collapseSentryInternalFrames(frame),
    });

    const maybePromiseCustomization = originalCustomizeFrame?.(frame) || undefined;

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
