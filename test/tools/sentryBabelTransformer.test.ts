jest.mock('fs', () => {
  return {
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
  };
});

import * as fs from 'fs';
import * as path from 'path';

// needs to be defined before sentryBabelTransformer is imported
// the transformer is created on import (side effect)
(fs.existsSync as jest.Mock).mockReturnValue(true);
(fs.readFileSync as jest.Mock).mockReturnValue(require.resolve('./fixtures/mockBabelTransformer.js'));
import * as SentryBabelTransformer from '../../src/js/tools/sentryBabelTransformer';
import type { BabelTransformerArgs } from '../../src/js/tools/vendor/metro/metroBabelTransformer';

const MockDefaultBabelTransformer: {
  transform: jest.Mock;
  getCacheKey: jest.Mock;
} = require('./fixtures/mockBabelTransformer');

describe('SentryBabelTransformer', () => {
  // WARN: since the mocked fs is called during import we can't clear mock before each test

  test('getCacheKey calls the original transformer', () => {
    SentryBabelTransformer.getCacheKey?.();

    expect(SentryBabelTransformer.getCacheKey).toBeDefined();
    expect(MockDefaultBabelTransformer.getCacheKey).toHaveBeenCalledTimes(1);
  });

  test('transform calls the original transformer', () => {
    SentryBabelTransformer.transform?.({
      filename: 'filename',
      options: {
        projectRoot: 'project/root',
      },
      plugins: [],
    } as BabelTransformerArgs);

    expect(fs.readFileSync).toHaveBeenCalledWith(path.join(process.cwd(), '.sentry/.defaultBabelTransformerPath'));
    expect(MockDefaultBabelTransformer.transform).toHaveBeenCalledTimes(1);
    expect(MockDefaultBabelTransformer.transform).toHaveBeenCalledWith({
      filename: 'filename',
      options: {
        projectRoot: 'project/root',
      },
      plugins: [expect.any(Function)],
    });
    expect(MockDefaultBabelTransformer.transform.mock.calls[0][0]['plugins'][0].name).toEqual(
      'componentNameAnnotatePlugin',
    );
  });
});
