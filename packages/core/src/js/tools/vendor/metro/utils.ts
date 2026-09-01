/* oxlint-disable typescript-eslint(no-unsafe-member-access) */
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
import type * as baseJSBundleType from 'metro/private/DeltaBundler/Serializers/baseJSBundle';
import type * as bundleToStringType from 'metro/private/lib/bundleToString';

import type { MetroSerializer } from '../../utils';

type SourceMapStringFunction = (
  modules: readonly Module[],
  options: {
    processModuleFilter?: (module: Module<MixedOutput>) => boolean;
    shouldAddToIgnoreList?: (module: Module<MixedOutput>) => boolean;
  },
) => string;

interface ResolvedMetroInternals {
  baseJSBundle: typeof baseJSBundleType;
  bundleToString: typeof bundleToStringType;
  sourceMapString: SourceMapStringFunction;
}

/**
 * Requires a Metro internal module, preferring the Metro used by the project being bundled
 * (`projectRoot`) over the SDK's own Metro dev dependency, which would otherwise generate source
 * maps with a mismatched (older) Metro version. In a normal install both resolve to the same Metro
 * instance, so behavior is unchanged.
 *
 * Resolution is location-first: every candidate path shape is tried against the app
 * (`projectRoot`) before falling back to the SDK's own location. Within a single location the
 * newer `metro/private/*` path is preferred over the legacy `metro/src/*` path, since Metro moved
 * its internals behind the `private` export. Ordering locations outside the path shapes is what
 * guarantees the app's Metro wins even when the two copies expose their internals via different
 * subpaths (e.g. app on `metro/src/*`, SDK on `metro/private/*`).
 */
// oxlint-disable-next-line typescript-eslint(no-explicit-any)
function requireMetroModule(candidates: string[], projectRoot: string | undefined): any {
  const roots = projectRoot ? [projectRoot, __dirname] : [__dirname];
  let lastError: unknown;
  for (const root of roots) {
    for (const candidate of candidates) {
      try {
        // the line below resolves `candidate` as Node would if
        // required from `root`, without actually requiring it from there. That's what lets us
        // pick up the app's node_modules Metro instead of the SDK's own, even though this code
        // itself lives inside the SDK.
        return require(require.resolve(candidate, { paths: [root] }));
      } catch (e) {
        lastError = e;
      }
    }
  }
  // Last resort: a bare require from the SDK's own module context. Preserves the previous
  // fallback behavior for environments where `require.resolve` with an explicit `paths` cannot
  // resolve a subpath that a plain `require` can. Runs only after every located attempt failed,
  // so it can never shadow the app's Metro.
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

/**
 * Normalizes a Metro internal module to its callable export, tolerating the different export
 * shapes Metro has used over versions (bare function, named export, or default export). Throws a
 * descriptive error when no callable can be found, so an unsupported Metro version fails loudly
 * with an actionable message instead of a later opaque "x is not a function".
 */
// oxlint-disable-next-line typescript-eslint(no-explicit-any)
function toCallable(metroModule: any, namedExport: string): any {
  const callable =
    typeof metroModule === 'function' ? metroModule : (metroModule?.[namedExport] ?? metroModule?.default);
  if (typeof callable !== 'function') {
    throw new Error(
      `[@sentry/react-native/metro] Could not resolve the '${namedExport}' function from Metro's internals. ` +
        `Please check the version of Metro you are using and report the issue at ` +
        `http://www.github.com/getsentry/sentry-react-native/issues`,
    );
  }
  return callable;
}

function resolveMetroInternals(projectRoot: string | undefined): ResolvedMetroInternals {
  const baseJSBundle: typeof baseJSBundleType = toCallable(
    requireMetroModule(
      ['metro/private/DeltaBundler/Serializers/baseJSBundle', 'metro/src/DeltaBundler/Serializers/baseJSBundle'],
      projectRoot,
    ),
    'baseJSBundle',
  );

  const bundleToString: typeof bundleToStringType = toCallable(
    requireMetroModule(['metro/private/lib/bundleToString', 'metro/src/lib/bundleToString'], projectRoot),
    'bundleToString',
  );

  const sourceMapString: SourceMapStringFunction = toCallable(
    requireMetroModule(
      ['metro/private/DeltaBundler/Serializers/sourceMapString', 'metro/src/DeltaBundler/Serializers/sourceMapString'],
      projectRoot,
    ),
    'sourceMapString',
  );

  return { baseJSBundle, bundleToString, sourceMapString };
}

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
  // Lazy-load Metro internals on the first serialization rather than at import or serializer
  // creation time. This defers requiring Metro until it's actually needed (during build) and,
  // crucially, until `options.projectRoot` is available so we can resolve the Metro used by the
  // app being bundled. Resolved once and memoized for subsequent bundles.
  let internals: ResolvedMetroInternals | undefined;

  return (entryPoint, preModules, graph, options) => {
    if (!internals) {
      internals = resolveMetroInternals(options.projectRoot);
    }
    const { baseJSBundle, bundleToString, sourceMapString } = internals;

    // baseJSBundle assigns IDs to modules in a consistent order
    let bundle = baseJSBundle(entryPoint, preModules, graph, options);
    const isHot = 'hot' in graph.transformOptions ? graph.transformOptions.hot : graph.transformOptions.dev;
    if (options.sentryBundleCallback && !isHot) {
      bundle = options.sentryBundleCallback(bundle);
    }
    const { code } = bundleToString(bundle);
    if (isHot) {
      // Hot/dev means running in dev server, sourcemaps are generated on demand
      return code;
    }

    // Always generate source maps, can't use Sentry without source maps
    const map = sourceMapString([...preModules, ...getSortedModules(graph, options)], {
      processModuleFilter: options.processModuleFilter,
      shouldAddToIgnoreList: options.shouldAddToIgnoreList || (() => false),
    });
    return { code, map };
  };
};
