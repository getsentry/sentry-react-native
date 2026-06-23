import type { Graph, Module, SerializerOptions } from 'metro';

import { logger } from '@sentry/core';
import * as fs from 'fs';

import { withSentryOptionsFromFile } from '../../src/js/tools/sentryOptionsSerializer';
import { createSet } from '../../src/js/tools/utils';

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
}));

const consoleErrorSpy = jest.spyOn(console, 'error');
const loggerDebugSpy = jest.spyOn(logger, 'debug');
const loggerErrorSpy = jest.spyOn(logger, 'error');

const customSerializerMock = jest.fn();
let mockedPreModules: Module[] = [];

const originalEnv = process.env;

describe('Sentry Options Serializer', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedPreModules = createMockedPreModules();
    process.env = { ...originalEnv };
    delete process.env.SENTRY_ENVIRONMENT;
    delete process.env.SENTRY_RELEASE;
    delete process.env.SENTRY_DIST;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  afterAll(() => {
    jest.clearAllMocks();
  });

  test('returns original config if optionsFile is false', () => {
    const config = () => ({
      projectRoot: '/test',
      serializer: {
        customSerializer: customSerializerMock,
      },
    });

    const result = withSentryOptionsFromFile(config(), false);
    expect(result).toEqual(config());
  });

  test('logs error and returns original config if projectRoot is missing', () => {
    const config = () => ({
      serializer: {
        customSerializer: customSerializerMock,
      },
    });

    const result = withSentryOptionsFromFile(config(), true);

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Project root is required'));
    expect(result).toEqual(config());
  });

  test('logs error and returns original config if customSerializer is missing', () => {
    const config = () => ({
      projectRoot: '/test',
      serializer: {},
    });
    const consoleErrorSpy = jest.spyOn(console, 'error');

    const result = withSentryOptionsFromFile(config(), true);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('`config.serializer.customSerializer` is required'),
    );
    expect(result).toEqual(config());
  });

  test('adds sentry options module when file exists and is valid JSON', () => {
    const config = () => ({
      projectRoot: '/test',
      serializer: {
        customSerializer: customSerializerMock,
      },
    });

    const mockOptions = { test: 'value' };
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockOptions));

    const actualConfig = withSentryOptionsFromFile(config(), true);
    actualConfig.serializer?.customSerializer(null, mockedPreModules, null, null);

    expect(mockedPreModules).toHaveLength(2);
    expect(mockedPreModules.at(-1)).toEqual(
      expect.objectContaining({
        getSource: expect.any(Function),
        path: '__sentry-options__',
        output: [
          {
            type: 'js/script/virtual',
            data: {
              code: 'var __SENTRY_OPTIONS__={"test":"value"};',
              lineCount: 1,
              map: [],
            },
          },
        ],
      }),
    );
    expect(mockedPreModules.at(-1).getSource().toString()).toEqual(mockedPreModules.at(-1).output[0].data.code);
    expect(loggerDebugSpy).toHaveBeenCalledWith(expect.stringContaining('options added to the bundle'));
  });

  test.each([
    ['SENTRY_ENVIRONMENT', 'environment', 'staging'],
    ['SENTRY_RELEASE', 'release', 'my-app@1.2.3'],
    ['SENTRY_DIST', 'dist', '42'],
  ])('overrides %s from the environment variable into the bundled options', (envKey, optionKey, envValue) => {
    process.env[envKey] = envValue;
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({ environment: 'production', other: 'value' }));

    const emitted = getEmittedOptions();

    expect(emitted[optionKey]).toEqual(envValue);
    expect(emitted.other).toEqual('value');
  });

  test('overrides all of environment, release and dist at once', () => {
    process.env.SENTRY_ENVIRONMENT = 'staging';
    process.env.SENTRY_RELEASE = 'my-app@1.2.3';
    process.env.SENTRY_DIST = '42';
    (fs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify({ environment: 'production', release: 'old', dist: '1' }),
    );

    expect(getEmittedOptions()).toEqual(
      expect.objectContaining({ environment: 'staging', release: 'my-app@1.2.3', dist: '42' }),
    );
  });

  test('does not override when env variable is an empty string', () => {
    process.env.SENTRY_ENVIRONMENT = '';
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({ environment: 'production' }));

    expect(getEmittedOptions().environment).toEqual('production');
  });

  test('keeps file value when env variable is not set', () => {
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({ environment: 'production' }));

    expect(getEmittedOptions().environment).toEqual('production');
  });

  test('does not throw when file content is valid JSON but not an object and env override is set', () => {
    process.env.SENTRY_ENVIRONMENT = 'staging';
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify('not-an-object'));

    const config = {
      projectRoot: '/test',
      serializer: { customSerializer: customSerializerMock },
    };

    expect(() =>
      withSentryOptionsFromFile(config, true).serializer?.customSerializer(null, mockedPreModules, null, null),
    ).not.toThrow();
    expect(mockedPreModules.at(-1)?.output[0].data.code).toEqual('var __SENTRY_OPTIONS__="not-an-object";');
  });

  test('logs error and does not add module when file does not exist', () => {
    const config = () => ({
      projectRoot: '/test',
      serializer: {
        customSerializer: customSerializerMock,
      },
    });

    (fs.readFileSync as jest.Mock).mockImplementation(() => {
      throw { code: 'ENOENT' };
    });

    const actualConfig = withSentryOptionsFromFile(config(), true);
    actualConfig.serializer?.customSerializer(null, mockedPreModules, null, null);

    expect(loggerDebugSpy).toHaveBeenCalledWith(expect.stringContaining('options file does not exist'));
    expect(mockedPreModules).toMatchObject(createMockedPreModules());
  });

  test('logs error and does not add module when file contains invalid JSON', () => {
    const config = () => ({
      projectRoot: '/test',
      serializer: {
        customSerializer: customSerializerMock,
      },
    });

    (fs.readFileSync as jest.Mock).mockReturnValue('invalid json');

    const actualConfig = withSentryOptionsFromFile(config(), true);
    actualConfig.serializer?.customSerializer(null, mockedPreModules, null, null);

    expect(loggerErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to parse Sentry options file'));
    expect(mockedPreModules).toMatchObject(createMockedPreModules());
  });

  test('calls original serializer with correct arguments and returns its result', () => {
    const mockedEntryPoint = 'entryPoint';
    const mockedGraph: Graph = jest.fn() as unknown as Graph;
    const mockedOptions: SerializerOptions = jest.fn() as unknown as SerializerOptions;
    const mockedResult = {};
    const originalSerializer = jest.fn().mockReturnValue(mockedResult);

    const actualConfig = withSentryOptionsFromFile(
      {
        projectRoot: '/test',
        serializer: {
          customSerializer: originalSerializer,
        },
      },
      true,
    );
    const actualResult = actualConfig.serializer?.customSerializer(
      mockedEntryPoint,
      mockedPreModules,
      mockedGraph,
      mockedOptions,
    );

    expect(originalSerializer).toHaveBeenCalledWith(mockedEntryPoint, mockedPreModules, mockedGraph, mockedOptions);
    expect(actualResult).toEqual(mockedResult);
  });

  test('mutates config in place to preserve object identity for Expo serializer closures', () => {
    const config = {
      projectRoot: '/test',
      serializer: {
        customSerializer: customSerializerMock,
        getModulesRunBeforeMainModule: jest.fn(),
      },
    };
    const originalSerializerObj = config.serializer;

    const result = withSentryOptionsFromFile(config, true);

    expect(result).toBe(config);
    expect(result.serializer).toBe(originalSerializerObj);
    expect(result.serializer?.customSerializer).not.toBe(customSerializerMock);
    expect(result.serializer?.getModulesRunBeforeMainModule).toBe(config.serializer.getModulesRunBeforeMainModule);
  });

  test('preserves __originalSerializer marker from Expo serializer', () => {
    const expoSerializer = Object.assign(jest.fn(), { __originalSerializer: null });
    const config = {
      projectRoot: '/test',
      serializer: {
        customSerializer: expoSerializer,
      },
    };

    const result = withSentryOptionsFromFile(config, true);

    expect('__originalSerializer' in (result.serializer?.customSerializer as Record<string, unknown>)).toBe(true);
    expect((result.serializer?.customSerializer as Record<string, unknown>).__originalSerializer).toBeNull();
  });

  test('does not add __originalSerializer when original serializer lacks it', () => {
    const plainSerializer = jest.fn();
    const config = {
      projectRoot: '/test',
      serializer: {
        customSerializer: plainSerializer,
      },
    };

    const result = withSentryOptionsFromFile(config, true);

    expect('__originalSerializer' in (result.serializer?.customSerializer as Record<string, unknown>)).toBe(false);
  });

  test('uses custom file path when optionsFile is a string', () => {
    const config = () => ({
      projectRoot: '/test',
      serializer: {
        customSerializer: customSerializerMock,
      },
    });

    withSentryOptionsFromFile(config(), 'custom/path.json').serializer?.customSerializer(
      null,
      mockedPreModules,
      null,
      null,
    );
    withSentryOptionsFromFile(config(), '/absolute/path.json').serializer?.customSerializer(
      null,
      mockedPreModules,
      null,
      null,
    );

    expect(fs.readFileSync).toHaveBeenCalledWith('/test/custom/path.json', expect.anything());
    expect(fs.readFileSync).toHaveBeenCalledWith('/absolute/path.json', expect.anything());
  });
});

function getEmittedOptions(): Record<string, unknown> {
  const config = {
    projectRoot: '/test',
    serializer: {
      customSerializer: customSerializerMock,
    },
  };

  withSentryOptionsFromFile(config, true).serializer?.customSerializer(null, mockedPreModules, null, null);

  const code = mockedPreModules.at(-1)?.output[0].data.code as string;
  const match = code.match(/^var __SENTRY_OPTIONS__=(.*);$/);
  if (!match) {
    throw new Error(`Unexpected emitted options code: ${code}`);
  }
  return JSON.parse(match[1]);
}

function createMockedPreModules(): Module[] {
  return [createMinimalModule()];
}

function createMinimalModule(): Module {
  return {
    dependencies: new Map(),
    getSource: getEmptySource,
    inverseDependencies: createSet(),
    path: '__sentry-options__',
    output: [],
  };
}

function getEmptySource(): Buffer {
  return Buffer.from('');
}
