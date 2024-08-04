jest.mock('fs', () => {
  return {
    readFileSync: jest.fn(),
  };
});

import * as fs from 'fs';

// needs to be defined before sentryBabelTransformer is imported
// the transformer is created on import (side effect)
(fs.readFileSync as jest.Mock).mockReturnValue(require.resolve('./fixtures/mockBabelTransformer.js'));

import * as SentryBabelTransformer from '../../src/js/tools/sentryBabelTransformer';
import type { BabelTransformerArgs } from '../../src/js/tools/vendor/metro/metroBabelTransformer';

const MockDefaultBabelTransformer: {
  transform: jest.Mock;
  getCacheKey: jest.Mock;
} = require('./fixtures/mockBabelTransformer');

describe('SentryBabelTransformer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getCacheKey calls the original transformer', () => {
    SentryBabelTransformer.getCacheKey?.();

    expect(SentryBabelTransformer.getCacheKey).toBeDefined();
    expect(MockDefaultBabelTransformer.getCacheKey).toHaveBeenCalledTimes(1);
  });

  test('transform calls the original transformer with the annotation plugin', () => {
    SentryBabelTransformer.transform?.({
      filename: '/project/file',
      options: {
        projectRoot: 'project/root',
      },
      plugins: [jest.fn()],
    } as BabelTransformerArgs);

    expect(MockDefaultBabelTransformer.transform).toHaveBeenCalledTimes(1);
    expect(MockDefaultBabelTransformer.transform).toHaveBeenCalledWith({
      filename: '/project/file',
      options: {
        projectRoot: 'project/root',
      },
      plugins: [expect.any(Function), expect.any(Function)],
    });
    expect(MockDefaultBabelTransformer.transform.mock.calls[0][0]['plugins'][1].name).toEqual(
      'componentNameAnnotatePlugin',
    );
  });

  test('transform adds plugin', () => {
    SentryBabelTransformer.transform?.({
      filename: '/project/file',
      options: {
        projectRoot: 'project/root',
      },
      plugins: [],
    } as BabelTransformerArgs);
  });

  test.each([
    [
      {
        filename: 'node_modules/file',
        plugins: [jest.fn()],
      } as BabelTransformerArgs,
    ],
    [
      {
        filename: 'project/node_modules/file',
        plugins: [jest.fn()],
      } as BabelTransformerArgs,
    ],
  ])('transform does not add plugin if filename includes node_modules', input => {
    SentryBabelTransformer.transform?.(input);

    expect(MockDefaultBabelTransformer.transform).toHaveBeenCalledTimes(1);
    expect(MockDefaultBabelTransformer.transform).toHaveBeenCalledWith({
      filename: input.filename,
      plugins: expect.not.arrayContaining([expect.objectContaining({ name: 'componentNameAnnotatePlugin' })]),
    });
  });
});
