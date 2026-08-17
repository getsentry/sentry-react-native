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
    process.env[SENTRY_BABEL_TRANSFORMER_OPTIONS] = JSON.stringify({
      annotateReactComponents: {},
    });

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
    process.env[SENTRY_BABEL_TRANSFORMER_OPTIONS] = JSON.stringify({
      annotateReactComponents: {},
    });

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

  test('degrades gracefully if options can not be parsed, transform skips opt-in plugins', () => {
    process.env[SENTRY_BABEL_TRANSFORMER_OPTIONS] = 'invalid json';

    createSentryBabelTransformer().transform?.(createMinimalMockedTransformOptions());

    expect(MockDefaultBabelTransformer.transform).toHaveBeenCalledTimes(1);
    // When persisted options are unparseable, opt-in Babel plugins must not be
    // silently injected — we cannot tell what the user asked for.
    const calledArgs = MockDefaultBabelTransformer.transform.mock.calls[0][0] as BabelTransformerArgs;
    expect(calledArgs.plugins).not.toEqual(
      expect.arrayContaining([[expect.objectContaining({ name: 'componentNameAnnotatePlugin' }), expect.anything()]]),
    );
  });

  test('does not add the annotation plugin when only autoWrapExpoRouterErrorBoundary is enabled', () => {
    process.env[SENTRY_BABEL_TRANSFORMER_OPTIONS] = JSON.stringify({
      autoWrapExpoRouterErrorBoundary: true,
    });

    createSentryBabelTransformer().transform?.(createMinimalMockedTransformOptions());

    expect(MockDefaultBabelTransformer.transform).toHaveBeenCalledTimes(1);
    const calledArgs = MockDefaultBabelTransformer.transform.mock.calls[0][0] as BabelTransformerArgs;
    expect(calledArgs.plugins).not.toEqual(
      expect.arrayContaining([[expect.objectContaining({ name: 'componentNameAnnotatePlugin' }), expect.anything()]]),
    );
  });

  test('transform adds the loud invariants plugin with its options', () => {
    process.env[SENTRY_BABEL_TRANSFORMER_OPTIONS] = JSON.stringify({
      loudInvariants: { pragmas: ['invariant', 'assert'] },
    });

    createSentryBabelTransformer().transform?.(createMinimalMockedTransformOptions());

    expect(MockDefaultBabelTransformer.transform).toHaveBeenCalledTimes(1);
    expect(MockDefaultBabelTransformer.transform).toHaveBeenCalledWith(
      expect.objectContaining({
        plugins: expect.arrayContaining([
          [expect.objectContaining({ name: 'sentryInvariantBabelPlugin' }), { pragmas: ['invariant', 'assert'] }],
        ]),
      }),
    );
  });

  test('transform does not add the loud invariants plugin for node_modules by default', () => {
    process.env[SENTRY_BABEL_TRANSFORMER_OPTIONS] = JSON.stringify({ loudInvariants: {} });

    createSentryBabelTransformer().transform?.({
      ...createMinimalMockedTransformOptions(),
      filename: '/project/node_modules/dep/index.js',
    });

    expect(MockDefaultBabelTransformer.transform).toHaveBeenCalledTimes(1);
    const calledArgs = MockDefaultBabelTransformer.transform.mock.calls[0][0] as BabelTransformerArgs;
    expect(calledArgs.plugins).not.toEqual(
      expect.arrayContaining([[expect.objectContaining({ name: 'sentryInvariantBabelPlugin' }), expect.anything()]]),
    );
  });

  test('transform adds the loud invariants plugin for node_modules when includeNodeModules is set', () => {
    process.env[SENTRY_BABEL_TRANSFORMER_OPTIONS] = JSON.stringify({
      loudInvariants: { includeNodeModules: true },
    });

    createSentryBabelTransformer().transform?.({
      ...createMinimalMockedTransformOptions(),
      filename: '/project/node_modules/dep/index.js',
    });

    expect(MockDefaultBabelTransformer.transform).toHaveBeenCalledTimes(1);
    expect(MockDefaultBabelTransformer.transform).toHaveBeenCalledWith(
      expect.objectContaining({
        plugins: expect.arrayContaining([
          [expect.objectContaining({ name: 'sentryInvariantBabelPlugin' }), { includeNodeModules: true }],
        ]),
      }),
    );
  });

  test('transform honors an includeNodeModules array allowlist for node_modules', () => {
    process.env[SENTRY_BABEL_TRANSFORMER_OPTIONS] = JSON.stringify({
      loudInvariants: { includeNodeModules: ['react-native/Libraries/Utilities'] },
    });

    // A non-allowlisted dependency is not instrumented.
    createSentryBabelTransformer().transform?.({
      ...createMinimalMockedTransformOptions(),
      filename: '/project/node_modules/other-dep/index.js',
    });
    const excludedArgs = MockDefaultBabelTransformer.transform.mock.calls[0][0] as BabelTransformerArgs;
    expect(excludedArgs.plugins).not.toEqual(
      expect.arrayContaining([[expect.objectContaining({ name: 'sentryInvariantBabelPlugin' }), expect.anything()]]),
    );

    // An allowlisted dependency path is instrumented.
    createSentryBabelTransformer().transform?.({
      ...createMinimalMockedTransformOptions(),
      filename: '/project/node_modules/react-native/Libraries/Utilities/Dimensions.js',
    });
    const includedArgs = MockDefaultBabelTransformer.transform.mock.calls[1][0] as BabelTransformerArgs;
    expect(includedArgs.plugins).toEqual(
      expect.arrayContaining([
        [
          expect.objectContaining({ name: 'sentryInvariantBabelPlugin' }),
          { includeNodeModules: ['react-native/Libraries/Utilities'] },
        ],
      ]),
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
