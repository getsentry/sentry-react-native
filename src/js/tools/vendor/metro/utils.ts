// Vendored / modified from @facebook/metro

// https://github.com/facebook/metro/commit/9b85f83c9cc837d8cd897aa7723be7da5b296067

// MIT License

// Copyright (c) Meta Platforms, Inc. and affiliates.

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import type { MixedOutput, Module, ReadOnlyGraph } from 'metro';
import * as baseJSBundle from 'metro/src/DeltaBundler/Serializers/baseJSBundle';
import * as sourceMapString from 'metro/src/DeltaBundler/Serializers/sourceMapString';
import * as bundleToString from 'metro/src/lib/bundleToString';

import type { MetroSerializer } from '../../utils';

type NewSourceMapStringExport = {
  // Since Metro v0.80.10 https://github.com/facebook/metro/compare/v0.80.9...v0.80.10#diff-1b836d1729e527a725305eef0cec22e44605af2700fa413f4c2489ea1a03aebcL28
  sourceMapString: typeof sourceMapString;
};

/**
 * This function ensures that modules in source maps are sorted in the same
 * order as in a plain JS bundle.
 *
 * https://github.com/facebook/metro/blob/9b85f83c9cc837d8cd897aa7723be7da5b296067/packages/metro/src/Server.js#L984
 */
export const getSortedModules = (
  graph: ReadOnlyGraph,
  {
    createModuleId,
  }: {
    createModuleId: (file: string) => number;
  },
): readonly Module[] => {
  const modules = [...graph.dependencies.values()];
  // Sort by IDs
  return modules.sort(
    (a: Module<MixedOutput>, b: Module<MixedOutput>) => createModuleId(a.path) - createModuleId(b.path),
  );
};

/**
 * Creates the default Metro plain bundle serializer.
 * Because Metro exports only the intermediate serializer functions, we need to
 * assemble the final serializer ourselves. We have to work with the modules the same as Metro does
 * to avoid unexpected changes in the final bundle.
 *
 * This is used when the user does not provide a custom serializer.
 *
 * https://github.com/facebook/metro/blob/9b85f83c9cc837d8cd897aa7723be7da5b296067/packages/metro/src/Server.js#L244-L277
 */
export const createDefaultMetroSerializer = (): MetroSerializer => {
  return (entryPoint, preModules, graph, options) => {
    // baseJSBundle assigns IDs to modules in a consistent order
    let bundle = baseJSBundle(entryPoint, preModules, graph, options);
    if (options.sentryBundleCallback && !graph.transformOptions.hot) {
      bundle = options.sentryBundleCallback(bundle);
    }
    const { code } = bundleToString(bundle);
    if (graph.transformOptions.hot) {
      // Hot means running in dev server, sourcemaps are generated on demand
      return code;
    }

    let sourceMapStringFunction: typeof sourceMapString | undefined;
    if (typeof sourceMapString === 'function') {
      sourceMapStringFunction = sourceMapString;
    } else if (
      typeof sourceMapString === 'object' &&
      sourceMapString != null &&
      'sourceMapString' in sourceMapString &&
      typeof sourceMapString['sourceMapString'] === 'function'
    ) {
      sourceMapStringFunction = (sourceMapString as NewSourceMapStringExport).sourceMapString;
    } else {
      throw new Error(`
[@sentry/react-native/metro] Cannot find sourceMapString function in 'metro/src/DeltaBundler/Serializers/sourceMapString'.
Please check the version of Metro you are using and report the issue at http://www.github.com/getsentry/sentry-react-native/issues
`);
    }

    // Always generate source maps, can't use Sentry without source maps
    const map = sourceMapStringFunction([...preModules, ...getSortedModules(graph, options)], {
      processModuleFilter: options.processModuleFilter,
      shouldAddToIgnoreList: options.shouldAddToIgnoreList,
    });
    return { code, map };
  };
};
