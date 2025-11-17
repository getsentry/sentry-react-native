import * as crypto from 'crypto';
// eslint-disable-next-line import/no-extraneous-dependencies
import type { MixedOutput, Module, ReadOnlyGraph } from 'metro';
import type { Bundle, MetroSerializer, MetroSerializerOutput, SerializedBundle, VirtualJSOutput } from './utils';
import {
  createDebugIdSnippet,
  createVirtualJSModule,
  determineDebugIdFromBundleSource,
  prependModule,
  stringToUUID,
} from './utils';
import { createDefaultMetroSerializer } from './vendor/metro/utils';

type SourceMap = Record<string, unknown>;

const DEBUG_ID_PLACE_HOLDER = '__debug_id_place_holder__';
const DEBUG_ID_MODULE_PATH = '__debugid__';

const SOURCE_MAP_COMMENT = '//# sourceMappingURL=';
const DEBUG_ID_COMMENT = '//# debugId=';

/**
 * Adds Sentry Debug ID polyfill module to the bundle.
 */
export function unstableBeforeAssetSerializationDebugIdPlugin({
  premodules,
  debugId,
}: {
  graph: ReadOnlyGraph<MixedOutput>;
  premodules: Module[];
  debugId?: string;
}): Module[] {
  if (!debugId) {
    return premodules;
  }

  const debugIdModuleExists = premodules.findIndex(module => module.path === DEBUG_ID_MODULE_PATH) != -1;
  if (debugIdModuleExists) {
    // eslint-disable-next-line no-console
    console.warn('\n\nDebug ID module found. Skipping Sentry Debug ID module...\n\n');
    return premodules;
  }

  const debugIdModule = createDebugIdModule(debugId);
  return prependModule(premodules, debugIdModule);
}

/**
 * Creates a Metro serializer that adds Debug ID module to the plain bundle.
 * The Debug ID module is a virtual module that provides a debug ID in runtime.
 *
 * RAM Bundles do not support custom serializers.
 */
export const createSentryMetroSerializer = (customSerializer?: MetroSerializer): MetroSerializer => {
  const serializer = customSerializer || createDefaultMetroSerializer();
  return async function (entryPoint, preModules, graph, options) {
    if (graph.transformOptions.hot) {
      return serializer(entryPoint, preModules, graph, options);
    }

    const debugIdModuleExists = preModules.findIndex(module => module.path === DEBUG_ID_MODULE_PATH) != -1;
    if (debugIdModuleExists) {
      // eslint-disable-next-line no-console
      console.warn('Debug ID module found. Skipping Sentry Debug ID module...');
      return serializer(entryPoint, preModules, graph, options);
    }

    const debugIdModule = createDebugIdModule(DEBUG_ID_PLACE_HOLDER);
    options.sentryBundleCallback = createSentryBundleCallback(debugIdModule);
    const modifiedPreModules = prependModule(preModules, debugIdModule);

    // Run wrapped serializer
    const serializerResult = serializer(entryPoint, modifiedPreModules, graph, options);
    const { code: bundleCode, map: bundleMapString } = await extractSerializerResult(serializerResult);

    // Add debug id comment to the bundle
    let debugId = determineDebugIdFromBundleSource(bundleCode);
    if (!debugId) {
      // For lazy-loaded chunks or bundles without the debug ID module,
      // calculate the debug ID from the bundle content.
      // This ensures Metro 0.83.2+ code-split bundles get debug IDs.
      // That needs to be done because when Metro 0.83.2 stopped importing `BabelSourceMapSegment`
      // from `@babel/generator` and defined it locally, it subtly changed the source map output format.
      // https://github.com/facebook/metro/blob/main/packages/metro-source-map/src/source-map.js#L47
      debugId = calculateDebugId(bundleCode);
      // eslint-disable-next-line no-console
      console.log('info ' + `Bundle Debug ID (calculated): ${debugId}`);
    }
    // Only print debug id for command line builds => not hot reload from dev server
    // eslint-disable-next-line no-console
    console.log('info ' + `Bundle Debug ID: ${debugId}`);

    const debugIdComment = `${DEBUG_ID_COMMENT}${debugId}`;
    const indexOfSourceMapComment = bundleCode.lastIndexOf(SOURCE_MAP_COMMENT);
    const bundleCodeWithDebugId =
      indexOfSourceMapComment === -1
        ? // If source map comment is missing lets just add the debug id comment
          `${bundleCode}\n${debugIdComment}`
        : // If source map comment is present lets add the debug id comment before it
          `${bundleCode.substring(0, indexOfSourceMapComment) + debugIdComment}\n${bundleCode.substring(
            indexOfSourceMapComment,
          )}`;

    const bundleMap: SourceMap = JSON.parse(bundleMapString);
    // For now we write both fields until we know what will become the standard - if ever.
    bundleMap['debug_id'] = debugId;
    bundleMap['debugId'] = debugId;

    return {
      code: bundleCodeWithDebugId,
      map: JSON.stringify(bundleMap),
    };
  };
};

/**
 * This function is expected to be called after serializer creates the final bundle object
 * and before the source maps are generated.
 *
 * It injects a debug ID into the bundle and returns the modified bundle.
 *
 * Access it via `options.sentryBundleCallback` in your custom serializer.
 */
function createSentryBundleCallback(debugIdModule: Module<VirtualJSOutput> & { setSource: (code: string) => void }) {
  return (bundle: Bundle) => {
    const debugId = calculateDebugId(bundle.pre, bundle.modules);
    debugIdModule.setSource(injectDebugId(debugIdModule.getSource().toString(), debugId));
    bundle.pre = injectDebugId(bundle.pre, debugId);
    return bundle;
  };
}

async function extractSerializerResult(serializerResult: MetroSerializerOutput): Promise<SerializedBundle> {
  if (typeof serializerResult === 'string') {
    return { code: serializerResult, map: '{}' };
  }

  if ('map' in serializerResult) {
    return { code: serializerResult.code, map: serializerResult.map };
  }

  const awaitedResult = await serializerResult;
  if (typeof awaitedResult === 'string') {
    return { code: awaitedResult, map: '{}' };
  }

  return { code: awaitedResult.code, map: awaitedResult.map };
}

function createDebugIdModule(debugId: string): Module<VirtualJSOutput> & { setSource: (code: string) => void } {
  return createVirtualJSModule(DEBUG_ID_MODULE_PATH, createDebugIdSnippet(debugId));
}

function calculateDebugId(bundleCode: string, modules?: Array<[id: number, code: string]>): string {
  const hash = crypto.createHash('md5');
  hash.update(bundleCode);
  if (modules) {
    for (const [, code] of modules) {
      hash.update(code);
    }
  }
  return stringToUUID(hash.digest('hex'));
}

function injectDebugId(code: string, debugId: string): string {
  // eslint-disable-next-line @sentry-internal/sdk/no-regexp-constructor
  return code.replace(new RegExp(DEBUG_ID_PLACE_HOLDER, 'g'), debugId);
}
