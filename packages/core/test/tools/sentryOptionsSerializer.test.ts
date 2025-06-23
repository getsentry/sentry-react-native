import { logger } from '@sentry/core';
import * as fs from 'fs';
import type { Graph, Module, SerializerOptions } from 'metro';

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

describe('Sentry Options Serializer', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedPreModules = createMockedPreModules();
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
