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

    // oxlint-disable-next-line typescript-eslint(no-dynamic-delete)
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
      plugins: [expect.any(Function), [expect.any(Function), expect.objectContaining({ autoInjectSentryLabel: true })]],
    });
    expect(MockDefaultBabelTransformer.transform.mock.calls[0][0]['plugins'][1][0].name).toEqual(
      'componentNameAnnotatePlugin',
    );
  });

  test('transform adds plugin with autoInjectSentryLabel enabled by default', () => {
    createSentryBabelTransformer().transform?.(createMinimalMockedTransformOptions());

    expect(MockDefaultBabelTransformer.transform).toHaveBeenCalledTimes(1);
    expect(MockDefaultBabelTransformer.transform).toHaveBeenCalledWith(
      expect.objectContaining({
        plugins: expect.arrayContaining([
          [
            expect.objectContaining({ name: 'componentNameAnnotatePlugin' }),
            expect.objectContaining({ autoInjectSentryLabel: true }),
          ],
        ]),
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
              autoInjectSentryLabel: true,
              ignoredComponents: ['MyCustomComponent'],
            }),
          ],
        ]),
      }),
    );
  });

  test('transform respects autoInjectSentryLabel: false override', () => {
    process.env[SENTRY_BABEL_TRANSFORMER_OPTIONS] = JSON.stringify({
      annotateReactComponents: {
        autoInjectSentryLabel: false,
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
              autoInjectSentryLabel: false,
            }),
          ],
        ]),
      }),
    );
  });

  test('transform passes textComponentNames to plugin', () => {
    process.env[SENTRY_BABEL_TRANSFORMER_OPTIONS] = JSON.stringify({
      annotateReactComponents: {
        textComponentNames: ['Text', 'MyText', 'Typography'],
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
              autoInjectSentryLabel: true,
              textComponentNames: ['Text', 'MyText', 'Typography'],
            }),
          ],
        ]),
      }),
    );
  });

  test('degrades gracefully if options can not be parsed, transform adds plugin with defaults', () => {
    process.env[SENTRY_BABEL_TRANSFORMER_OPTIONS] = 'invalid json';

    createSentryBabelTransformer().transform?.(createMinimalMockedTransformOptions());

    expect(MockDefaultBabelTransformer.transform).toHaveBeenCalledTimes(1);
    expect(MockDefaultBabelTransformer.transform).toHaveBeenCalledWith(
      expect.objectContaining({
        plugins: expect.arrayContaining([
          [
            expect.objectContaining({ name: 'componentNameAnnotatePlugin' }),
            expect.objectContaining({ autoInjectSentryLabel: true }),
          ],
        ]),
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
