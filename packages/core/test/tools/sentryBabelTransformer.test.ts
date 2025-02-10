import * as process from 'process';

import {
  createSentryBabelTransformer,
  SENTRY_BABEL_TRANSFORMER_OPTIONS,
  SENTRY_DEFAULT_BABEL_TRANSFORMER_PATH,
} from '../../src/js/tools/sentryBabelTransformerUtils';

process.env[SENTRY_DEFAULT_BABEL_TRANSFORMER_PATH] = require.resolve('./fixtures/mockBabelTransformer.js');

import type { BabelTransformerArgs } from '../../src/js/tools/vendor/metro/metroBabelTransformer';

const MockDefaultBabelTransformer: {
  transform: jest.Mock;
  getCacheKey: jest.Mock;
} = require('./fixtures/mockBabelTransformer');

describe('SentryBabelTransformer', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete process.env[SENTRY_BABEL_TRANSFORMER_OPTIONS];
  });

  test('getCacheKey calls the original transformer', () => {
    createSentryBabelTransformer().getCacheKey?.();

    expect(createSentryBabelTransformer().getCacheKey).toBeDefined();
    expect(MockDefaultBabelTransformer.getCacheKey).toHaveBeenCalledTimes(1);
  });

  test('transform calls the original transformer with the annotation plugin', () => {
    createSentryBabelTransformer().transform?.({
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
    createSentryBabelTransformer().transform?.(createMinimalMockedTransformOptions());

    expect(MockDefaultBabelTransformer.transform).toHaveBeenCalledTimes(1);
    expect(MockDefaultBabelTransformer.transform).toHaveBeenCalledWith(
      expect.objectContaining({
        plugins: expect.arrayContaining([expect.objectContaining({ name: 'componentNameAnnotatePlugin' })]),
      }),
    );
  });

  test('transform adds plugin with options', () => {
    process.env[SENTRY_BABEL_TRANSFORMER_OPTIONS] = JSON.stringify({
      annotateReactComponents: {
        ignoredComponents: ['MyCustomComponent'],
      },
    });

    createSentryBabelTransformer().transform?.(createMinimalMockedTransformOptions());

    expect(MockDefaultBabelTransformer.transform).toHaveBeenCalledTimes(1);
    expect(MockDefaultBabelTransformer.transform).toHaveBeenCalledWith(
      expect.objectContaining({
        plugins: expect.arrayContaining([
          [
            expect.objectContaining({ name: 'componentNameAnnotatePlugin' }),
            expect.objectContaining({
              ignoredComponents: ['MyCustomComponent'],
            }),
          ],
        ]),
      }),
    );
  });

  test('degrades gracefully if options can not be parsed, transform adds plugin without options', () => {
    process.env[SENTRY_BABEL_TRANSFORMER_OPTIONS] = 'invalid json';

    createSentryBabelTransformer().transform?.(createMinimalMockedTransformOptions());

    expect(MockDefaultBabelTransformer.transform).toHaveBeenCalledTimes(1);
    expect(MockDefaultBabelTransformer.transform).toHaveBeenCalledWith(
      expect.objectContaining({
        plugins: expect.arrayContaining([expect.objectContaining({ name: 'componentNameAnnotatePlugin' })]),
      }),
    );
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
    createSentryBabelTransformer().transform?.(input);

    expect(MockDefaultBabelTransformer.transform).toHaveBeenCalledTimes(1);
    expect(MockDefaultBabelTransformer.transform).toHaveBeenCalledWith({
      filename: input.filename,
      plugins: expect.not.arrayContaining([expect.objectContaining({ name: 'componentNameAnnotatePlugin' })]),
    });
  });
});

function createMinimalMockedTransformOptions(): BabelTransformerArgs {
  return {
    filename: '/project/file',
    options: {
      projectRoot: 'project/root',
    },
    plugins: [],
  } as BabelTransformerArgs;
}
