jest.mock('fs', () => {
  return {
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
    unlinkSync: jest.fn(),
  };
});

import * as fs from 'fs';
import type { MetroConfig } from 'metro';
import * as path from 'path';
import * as process from 'process';

import {
  withSentryBabelTransformer,
  withSentryFramesCollapsed,
  withSentryResolver,
} from '../../src/js/tools/metroconfig';

type MetroFrame = Parameters<Required<Required<MetroConfig>['symbolicator']>['customizeFrame']>[0];

describe('metroconfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
        expect(withSentryBabelTransformer(JSON.parse(JSON.stringify(input)))).toEqual(input);
      },
    );

    test.each([
      [{ transformer: { babelTransformerPath: 'babelTransformerPath' }, projectRoot: 'project/root' }],
      [{ transformer: { babelTransformerPath: 'babelTransformerPath' } }],
    ])('save default babel transformer path to a file', () => {
      const defaultBabelTransformerPath = '/default/babel/transformer';

      withSentryBabelTransformer({
        transformer: {
          babelTransformerPath: defaultBabelTransformerPath,
        },
        projectRoot: 'project/root',
      });

      expect(fs.mkdirSync).toHaveBeenCalledWith(path.join(process.cwd(), '.sentry'), { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join(process.cwd(), '.sentry/.defaultBabelTransformerPath'),
        defaultBabelTransformerPath,
      );
    });

    test('clean default babel transformer path file on exit', () => {
      const processOnSpy: jest.SpyInstance = jest.spyOn(process, 'on');

      const defaultBabelTransformerPath = 'defaultBabelTransformerPath';

      withSentryBabelTransformer({
        transformer: {
          babelTransformerPath: defaultBabelTransformerPath,
        },
        projectRoot: 'project/root',
      });

      const actualExitHandler: () => void | undefined = processOnSpy.mock.calls[0][1];
      actualExitHandler?.();

      expect(processOnSpy).toHaveBeenCalledWith('exit', expect.any(Function));
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(process.cwd(), '.sentry/.defaultBabelTransformerPath'));
    });

    test('return config with sentry babel transformer path', () => {
      const defaultBabelTransformerPath = 'defaultBabelTransformerPath';

      const config = withSentryBabelTransformer({
        transformer: {
          babelTransformerPath: defaultBabelTransformerPath,
        },
      });

      expect(config.transformer?.babelTransformerPath).toBe(
        require.resolve('../../src/js/tools/sentryBabelTransformer'),
      );
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

    describe('on new metro', () => {
      beforeEach(() => {
        jest.resetModules();
        // Mock metro/package.json
        jest.mock('metro/package.json', () => ({
          version: '0.70.0',
        }));
      });

      test('keep Web Replay when platform is web and includeWebReplay is true', () => {
        const modifiedConfig = withSentryResolver(config, true);
        resolveRequest(modifiedConfig, contextMock, '@sentry/replay', 'web');

        expect(originalResolverMock).toHaveBeenCalledWith(contextMock, '@sentry/replay', 'web');
      });

      test('removes Web Replay when platform is web and includeWebReplay is false', () => {
        const modifiedConfig = withSentryResolver(config, false);
        const result = resolveRequest(modifiedConfig, contextMock, '@sentry/replay', 'web');

        expect(result).toEqual({ type: 'empty' });
        expect(originalResolverMock).not.toHaveBeenCalled();
      });

      test('keep Web Replay when platform is android and includeWebReplay is true', () => {
        const modifiedConfig = withSentryResolver(config, true);
        resolveRequest(modifiedConfig, contextMock, '@sentry/replay', 'android');

        expect(originalResolverMock).toHaveBeenCalledWith(contextMock, '@sentry/replay', 'android');
      });

      test('removes Web Replay when platform is android and includeWebReplay is false', () => {
        const modifiedConfig = withSentryResolver(config, false);
        const result = resolveRequest(modifiedConfig, contextMock, '@sentry/replay', 'android');

        expect(result).toEqual({ type: 'empty' });
        expect(originalResolverMock).not.toHaveBeenCalled();
      });

      test('removes Web Replay when platform is android and includeWebReplay is undefined', () => {
        const modifiedConfig = withSentryResolver(config, undefined);
        const result = resolveRequest(modifiedConfig, contextMock, '@sentry/replay', 'android');

        expect(result).toEqual({ type: 'empty' });
        expect(originalResolverMock).not.toHaveBeenCalled();
      });

      test('keep Web Replay when platform is ios and includeWebReplay is true', () => {
        const modifiedConfig = withSentryResolver(config, true);
        resolveRequest(modifiedConfig, contextMock, '@sentry/replay', 'ios');

        expect(originalResolverMock).toHaveBeenCalledWith(contextMock, '@sentry/replay', 'ios');
      });

      test('removes Web Replay when platform is ios and includeWebReplay is false', () => {
        const modifiedConfig = withSentryResolver(config, false);
        const result = resolveRequest(modifiedConfig, contextMock, '@sentry/replay', 'ios');

        expect(result).toEqual({ type: 'empty' });
        expect(originalResolverMock).not.toHaveBeenCalled();
      });

      test('removes Web Replay when platform is ios and includeWebReplay is undefined', () => {
        const modifiedConfig = withSentryResolver(config, undefined);
        const result = resolveRequest(modifiedConfig, contextMock, '@sentry/replay', 'ios');

        expect(result).toEqual({ type: 'empty' });
        expect(originalResolverMock).not.toHaveBeenCalled();
      });

      test('calls originalResolver when moduleName is not @sentry/replay', () => {
        const modifiedConfig = withSentryResolver(config, true);
        const moduleName = 'some/other/module';
        resolveRequest(modifiedConfig, contextMock, moduleName, 'web');

        expect(originalResolverMock).toHaveBeenCalledWith(contextMock, moduleName, 'web');
      });

      test('calls originalResolver when moduleName is not @sentry/replay and includeWebReplay set to false', () => {
        const modifiedConfig = withSentryResolver(config, false);
        const moduleName = 'some/other/module';
        resolveRequest(modifiedConfig, contextMock, moduleName, 'web');

        expect(originalResolverMock).toHaveBeenCalledWith(contextMock, moduleName, 'web');
      });

      test('calls context.resolveRequest when originalResolver is not provided', () => {
        const modifiedConfig = withSentryResolver({ resolver: {} }, true);
        const moduleName = 'some/other/module';
        resolveRequest(modifiedConfig, contextMock, moduleName, 'web');

        expect(contextMock.resolveRequest).toHaveBeenCalledWith(contextMock, moduleName, 'web');
      });
    });

    describe('on old metro', () => {
      beforeEach(() => {
        jest.resetModules();
        // Mock metro/package.json
        jest.mock('metro/package.json', () => ({
          version: '0.67.0',
        }));

        jest.mock('metro-resolver', () => ({
          resolve: jest.fn(),
        }));
      });

      test('keep Web Replay when platform is web and includeWebReplay is true', () => {
        const modifiedConfig = withSentryResolver(config, true);
        resolveRequest(modifiedConfig, contextMock, 'real@sentry/replay', 'web', '@sentry/replay');

        expect(originalResolverMock).toHaveBeenCalledWith(contextMock, 'real@sentry/replay', 'web', '@sentry/replay');
      });

      test('removes Web Replay when platform is web and includeWebReplay is false', () => {
        const modifiedConfig = withSentryResolver(config, false);
        const result = resolveRequest(modifiedConfig, contextMock, 'real@sentry/replay', 'web', '@sentry/replay');

        expect(result).toEqual({ type: 'empty' });
        expect(originalResolverMock).not.toHaveBeenCalled();
      });

      test('keep Web Replay when platform is android and includeWebReplay is true', () => {
        const modifiedConfig = withSentryResolver(config, true);
        resolveRequest(modifiedConfig, contextMock, 'real@sentry/replay', 'android', '@sentry/replay');

        expect(originalResolverMock).toHaveBeenCalledWith(
          contextMock,
          'real@sentry/replay',
          'android',
          '@sentry/replay',
        );
      });

      test('removes Web Replay when platform is android and includeWebReplay is false', () => {
        const modifiedConfig = withSentryResolver(config, false);
        const result = resolveRequest(modifiedConfig, contextMock, 'real@sentry/replay', 'android', '@sentry/replay');

        expect(result).toEqual({ type: 'empty' });
        expect(originalResolverMock).not.toHaveBeenCalled();
      });

      test('removes Web Replay when platform is android and includeWebReplay is undefined', () => {
        const modifiedConfig = withSentryResolver(config, undefined);
        const result = resolveRequest(modifiedConfig, contextMock, 'real@sentry/replay', 'android', '@sentry/replay');

        expect(result).toEqual({ type: 'empty' });
        expect(originalResolverMock).not.toHaveBeenCalled();
      });

      test('keep Web Replay when platform is ios and includeWebReplay is true', () => {
        const modifiedConfig = withSentryResolver(config, true);
        resolveRequest(modifiedConfig, contextMock, 'real@sentry/replay', 'ios', '@sentry/replay');

        expect(originalResolverMock).toHaveBeenCalledWith(contextMock, 'real@sentry/replay', 'ios', '@sentry/replay');
      });

      test('removes Web Replay when platform is ios and includeWebReplay is false', () => {
        const modifiedConfig = withSentryResolver(config, false);
        const result = resolveRequest(modifiedConfig, contextMock, 'real@sentry/replay', 'ios', '@sentry/replay');

        expect(result).toEqual({ type: 'empty' });
        expect(originalResolverMock).not.toHaveBeenCalled();
      });

      test('removes Web Replay when platform is ios and includeWebReplay is undefined', () => {
        const modifiedConfig = withSentryResolver(config, undefined);
        const result = resolveRequest(modifiedConfig, contextMock, 'real@sentry/replay', 'ios', '@sentry/replay');

        expect(result).toEqual({ type: 'empty' });
        expect(originalResolverMock).not.toHaveBeenCalled();
      });

      test('calls originalResolver when moduleName is not @sentry/replay', () => {
        const modifiedConfig = withSentryResolver(config, true);
        const moduleName = 'some/other/module';
        const realModuleName = `real${moduleName}`;
        resolveRequest(modifiedConfig, contextMock, realModuleName, 'web', moduleName);

        expect(originalResolverMock).toHaveBeenCalledWith(contextMock, realModuleName, 'web', moduleName);
      });

      test('calls originalResolver when moduleName is not @sentry/replay and includeWebReplay set to false', () => {
        const modifiedConfig = withSentryResolver(config, false);
        const moduleName = 'some/other/module';
        const realModuleName = `real${moduleName}`;
        resolveRequest(modifiedConfig, contextMock, realModuleName, 'web', moduleName);

        expect(originalResolverMock).toHaveBeenCalledWith(contextMock, realModuleName, 'web', moduleName);
      });

      test('calls default resolver when originalResolver is not provided', () => {
        const resolve = require('metro-resolver').resolve;
        const modifiedConfig = withSentryResolver({ resolver: {} }, true);
        const moduleName = 'some/other/module';
        const realModuleName = `real${moduleName}`;
        resolveRequest(modifiedConfig, contextMock, realModuleName, 'web', moduleName);

        expect(contextMock.resolveRequest).not.toHaveBeenCalled();
        expect(resolve).toHaveBeenCalledWith(
          {
            ...contextMock,
            resolveRequest: null,
          },
          moduleName,
          'web',
          realModuleName,
        );
      });
    });
  });
});

// function create mock metro frame
function createMockSentryInstrumentMetroFrame(): MetroFrame {
  return { file: 'node_modules/@sentry/utils/cjs/instrument.js' };
}

type ResolverFourParams = (
  // @ts-expect-error Can't see type CustomResolutionContext
  context: CustomResolutionContext,
  moduleName: string,
  platform: string | null,
  realModuleName?: string,
  // @ts-expect-error Can't see type CustomResolutionContext
) => Resolution;

// @ts-expect-error Can't see type Resolution.
function resolveRequest(
  metroConfig: MetroConfig,
  context: any,
  moduleName: string,
  platform: string,
  moduleNameOldMetro?: string,
): Resolution {
  if (moduleNameOldMetro) {
    const resolver = metroConfig.resolver?.resolveRequest as ResolverFourParams;
    return resolver(context, moduleName, platform, moduleNameOldMetro);
  }
  return metroConfig.resolver?.resolveRequest && metroConfig.resolver.resolveRequest(context, moduleName, platform);
}
