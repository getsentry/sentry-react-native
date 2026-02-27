import type { getDefaultConfig } from 'expo/metro-config';
import type { MetroConfig } from 'metro';
import * as process from 'process';
import type { SentryExpoConfigOptions } from '../../src/js/tools/metroconfig';
import {
  getSentryExpoConfig,
  withSentryBabelTransformer,
  withSentryFramesCollapsed,
  withSentryResolver,
} from '../../src/js/tools/metroconfig';
import {
  SENTRY_BABEL_TRANSFORMER_OPTIONS,
  SENTRY_DEFAULT_BABEL_TRANSFORMER_PATH,
} from '../../src/js/tools/sentryBabelTransformerUtils';

type MetroFrame = Parameters<Required<Required<MetroConfig>['symbolicator']>['customizeFrame']>[0];

describe('metroconfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete process.env[SENTRY_BABEL_TRANSFORMER_OPTIONS];
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete process.env[SENTRY_DEFAULT_BABEL_TRANSFORMER_PATH];
  });

  test('getSentryExpoConfig keeps compatible interface with Expos getDefaultConfig', () => {
    const acceptsExpoDefaultConfigFactory = (_factory: typeof getDefaultConfig): void => {
      expect(true).toBe(true);
    };
    acceptsExpoDefaultConfigFactory(getSentryExpoConfig);
  });

  describe('SentryExpoConfigOptions.getDefaultConfig type compatibility', () => {
    const checkCompatibility = (_options: SentryExpoConfigOptions): void => {
      expect(true).toBe(true);
    };

    test('accepts a getDefaultConfig with the new flexible Record<string, unknown> signature (Expo SDK 54 format)', () => {
      // Expo SDK 54 Metro type definitions diverged from the metro package.
      // The fix allows passing a getDefaultConfig with flexible types rather than
      // the exact MetroConfig return type, accommodating different Metro versions.
      const newFormatGetDefaultConfig = (
        _projectRoot: string,
        _options?: Record<string, unknown>,
      ): Record<string, unknown> => ({});

      checkCompatibility({ getDefaultConfig: newFormatGetDefaultConfig });
    });

    test('accepts a getDefaultConfig wrapping expo/metro-config (old usage pattern)', () => {
      // Old usage pattern: users wrapping expo/metro-config's getDefaultConfig to
      // add custom transformer or resolver config (e.g. react-native-svg-transformer).
      // Record<string, unknown> options are compatible with DefaultConfigOptions,
      // and the spread object return type is compatible with Record<string, unknown>.
      const expoGetDefaultConfigMock: typeof getDefaultConfig = jest.fn().mockReturnValue({});

      const oldPatternGetDefaultConfig = (projectRoot: string, options?: Record<string, unknown>) => {
        // Record<string, unknown> is compatible with DefaultConfigOptions (all optional fields)
        const config = expoGetDefaultConfigMock(projectRoot, options as Parameters<typeof getDefaultConfig>[1]);
        return {
          ...config,
          transformer: {
            ...config.transformer,
          },
        };
      };

      checkCompatibility({ getDefaultConfig: oldPatternGetDefaultConfig });
    });
  });

  describe('withSentryFramesCollapsed', () => {
    test('adds customizeFrames if undefined ', () => {
      const config = withSentryFramesCollapsed({});
      expect(config.symbolicator?.customizeFrame).toBeDefined();
    });

    test('wraps existing customizeFrames', async () => {
      const originalCustomizeFrame = jest.fn();
      const config = withSentryFramesCollapsed({ symbolicator: { customizeFrame: originalCustomizeFrame } });

      const customizeFrame = config.symbolicator?.customizeFrame;
      await customizeFrame?.(createMockSentryInstrumentMetroFrame());

      expect(config.symbolicator?.customizeFrame).not.toBe(originalCustomizeFrame);
      expect(originalCustomizeFrame).toHaveBeenCalledTimes(1);
    });

    test('collapses sentry instrument frames', async () => {
      const config = withSentryFramesCollapsed({});

      const customizeFrame = config.symbolicator?.customizeFrame;
      const customizedFrame = await customizeFrame?.(createMockSentryInstrumentMetroFrame());

      expect(customizedFrame?.collapse).toBe(true);
    });
  });

  describe('withSentryBabelTransformer', () => {
    test.each([[{}], [{ transformer: {} }], [{ transformer: { hermesParser: true } }]])(
      "does not add babel transformer none is set in the config object '%o'",
      input => {
        expect(withSentryBabelTransformer(JSON.parse(JSON.stringify(input)), {})).toEqual(input);
      },
    );

    test('save default babel transformer path to environment variable', () => {
      const defaultBabelTransformerPath = '/default/babel/transformer';

      withSentryBabelTransformer(
        {
          transformer: {
            babelTransformerPath: defaultBabelTransformerPath,
          },
        },
        {},
      );

      expect(process.env[SENTRY_DEFAULT_BABEL_TRANSFORMER_PATH]).toBe(defaultBabelTransformerPath);
    });

    test('return config with sentry babel transformer path', () => {
      const defaultBabelTransformerPath = 'defaultBabelTransformerPath';

      const config = withSentryBabelTransformer(
        {
          transformer: {
            babelTransformerPath: defaultBabelTransformerPath,
          },
        },
        {},
      );

      expect(config.transformer?.babelTransformerPath).toBe(
        require.resolve('../../src/js/tools/sentryBabelTransformer'),
      );
    });

    test('save babel transformer options to environment variable', () => {
      withSentryBabelTransformer(
        {
          transformer: {
            babelTransformerPath: 'path/to/babel/transformer',
          },
        },
        {
          ignoredComponents: ['MyCustomComponent'],
        },
      );

      expect(process.env[SENTRY_BABEL_TRANSFORMER_OPTIONS]).toBe(
        JSON.stringify({
          annotateReactComponents: {
            ignoredComponents: ['MyCustomComponent'],
          },
        }),
      );
    });

    test('gracefully handle none serializable babel transformer options', () => {
      withSentryBabelTransformer(
        {
          transformer: {
            babelTransformerPath: 'path/to/babel/transformer',
          },
        },
        {
          ignoredComponents: ['MyCustomComponent'],
          nonSerializable: BigInt(1),
        } as any,
      );

      expect(process.env[SENTRY_BABEL_TRANSFORMER_OPTIONS]).toBeUndefined();
    });
  });

  describe('withSentryResolver', () => {
    let originalResolverMock: any;

    // @ts-expect-error Can't see type CustomResolutionContext
    let contextMock: CustomResolutionContext;
    let config: MetroConfig = {};

    beforeEach(() => {
      originalResolverMock = jest.fn();
      contextMock = {
        resolveRequest: jest.fn(),
      };

      config = {
        resolver: {
          resolveRequest: originalResolverMock,
        },
      };
    });

    describe.each([
      ['new Metro', false, '0.70.0'],
      ['old Metro', true, '0.67.0'],
    ])('on %s', (description, oldMetro, metroVersion) => {
      beforeEach(() => {
        jest.resetModules();
        // Mock metro/package.json
        jest.mock('metro/package.json', () => ({
          version: metroVersion,
        }));
      });

      describe.each([['@sentry/replay'], ['@sentry-internal/replay']])('with %s', replayPackage => {
        test('keep Web Replay when platform is web and includeWebReplay is true', () => {
          const modifiedConfig = withSentryResolver(config, true);
          resolveRequest(modifiedConfig, contextMock, replayPackage, 'web');

          ExpectToBeCalledWithMetroParameters(originalResolverMock, contextMock, replayPackage, 'web');
        });

        test('removes Web Replay when platform is web and includeWebReplay is false', () => {
          const modifiedConfig = withSentryResolver(config, false);
          const result = resolveRequest(modifiedConfig, contextMock, replayPackage, 'web');

          expect(result).toEqual({ type: 'empty' });
          expect(originalResolverMock).not.toHaveBeenCalled();
        });

        test('keep Web Replay when platform is android and includeWebReplay is true', () => {
          const modifiedConfig = withSentryResolver(config, true);
          resolveRequest(modifiedConfig, contextMock, replayPackage, 'android');

          ExpectToBeCalledWithMetroParameters(originalResolverMock, contextMock, replayPackage, 'android');
        });

        test('removes Web Replay when platform is android and includeWebReplay is false', () => {
          const modifiedConfig = withSentryResolver(config, false);
          const result = resolveRequest(modifiedConfig, contextMock, replayPackage, 'android');

          expect(result).toEqual({ type: 'empty' });
          expect(originalResolverMock).not.toHaveBeenCalled();
        });

        test('removes Web Replay when platform is android and includeWebReplay is undefined', () => {
          const modifiedConfig = withSentryResolver(config, undefined);
          const result = resolveRequest(modifiedConfig, contextMock, replayPackage, 'android');

          expect(result).toEqual({ type: 'empty' });
          expect(originalResolverMock).not.toHaveBeenCalled();
        });

        test('keep Web Replay when platform is undefined and includeWebReplay is null', () => {
          const modifiedConfig = withSentryResolver(config, undefined);
          resolveRequest(modifiedConfig, contextMock, replayPackage, null);

          ExpectToBeCalledWithMetroParameters(originalResolverMock, contextMock, replayPackage, null);
        });

        test('keep Web Replay when platform is ios and includeWebReplay is true', () => {
          const modifiedConfig = withSentryResolver(config, true);
          resolveRequest(modifiedConfig, contextMock, replayPackage, 'ios');

          ExpectToBeCalledWithMetroParameters(originalResolverMock, contextMock, replayPackage, 'ios');
        });

        test('removes Web Replay when platform is ios and includeWebReplay is false', () => {
          const modifiedConfig = withSentryResolver(config, false);
          const result = resolveRequest(modifiedConfig, contextMock, replayPackage, 'ios');

          expect(result).toEqual({ type: 'empty' });
          expect(originalResolverMock).not.toHaveBeenCalled();
        });

        test('removes Web Replay when platform is ios and includeWebReplay is undefined', () => {
          const modifiedConfig = withSentryResolver(config, undefined);
          const result = resolveRequest(modifiedConfig, contextMock, replayPackage, 'ios');

          expect(result).toEqual({ type: 'empty' });
          expect(originalResolverMock).not.toHaveBeenCalled();
        });
      });

      test('calls originalResolver when moduleName is not @sentry/replay', () => {
        const modifiedConfig = withSentryResolver(config, true);
        const moduleName = 'some/other/module';
        resolveRequest(modifiedConfig, contextMock, moduleName, 'web');

        ExpectToBeCalledWithMetroParameters(originalResolverMock, contextMock, moduleName, 'web');
      });

      test('calls originalResolver when moduleName is not @sentry/replay and includeWebReplay set to false', () => {
        const modifiedConfig = withSentryResolver(config, false);
        const moduleName = 'some/other/module';
        resolveRequest(modifiedConfig, contextMock, moduleName, 'web');

        ExpectToBeCalledWithMetroParameters(originalResolverMock, contextMock, moduleName, 'web');
      });

      test('calls default resolver on new metro resolver when originalResolver is not provided', () => {
        if (oldMetro) {
          return;
        }

        const modifiedConfig = withSentryResolver({ resolver: {} }, true);
        const moduleName = 'some/other/module';
        const platform = 'web';
        resolveRequest(modifiedConfig, contextMock, moduleName, platform);

        ExpectToBeCalledWithMetroParameters(contextMock.resolveRequest, contextMock, moduleName, platform);
      });

      test('throws error when running on old metro and includeWebReplay is set to false', () => {
        if (!oldMetro) {
          return;
        }

        // @ts-expect-error mock.
        const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});
        const modifiedConfig = withSentryResolver({ resolver: {} }, true);
        const moduleName = 'some/other/module';
        resolveRequest(modifiedConfig, contextMock, moduleName, 'web');

        expect(mockExit).toHaveBeenCalledWith(-1);
      });

      type CustomResolverBeforeMetro067 = (
        // @ts-expect-error Can't see type CustomResolutionContext
        context: CustomResolutionContext,
        realModuleName: string,
        platform: string | null,
        moduleName?: string,
        // @ts-expect-error Can't see type CustomResolutionContext
      ) => Resolution;

      function resolveRequest(
        metroConfig: MetroConfig,
        context: any,
        moduleName: string,
        platform: string | null,
        // @ts-expect-error Can't see type Resolution.
      ): Resolution {
        if (oldMetro) {
          const resolver = metroConfig.resolver?.resolveRequest as CustomResolverBeforeMetro067;
          // On older Metro the resolveRequest is the creater resolver.
          context.resolveRequest = resolver;
          return resolver(context, `real${moduleName}`, platform, moduleName);
        }
        return (
          metroConfig.resolver?.resolveRequest && metroConfig.resolver.resolveRequest(context, moduleName, platform)
        );
      }

      function ExpectToBeCalledWithMetroParameters(
        received: CustomResolverBeforeMetro067,
        contextMock: CustomResolverBeforeMetro067,
        moduleName: string,
        platform: string | null,
      ) {
        if (oldMetro) {
          expect(received).toHaveBeenCalledWith(contextMock, `real${moduleName}`, platform, moduleName);
        } else {
          expect(received).toHaveBeenCalledWith(contextMock, moduleName, platform);
        }
      }
    });
  });
});

// function create mock metro frame
function createMockSentryInstrumentMetroFrame(): MetroFrame {
  return { file: 'node_modules/@sentry/core/cjs/instrument.js' };
}
