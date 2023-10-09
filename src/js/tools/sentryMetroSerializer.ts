import * as crypto from 'crypto';
import type { MixedOutput, Module } from 'metro';
import CountingSet from 'metro/src/lib/CountingSet';
import * as countLines from 'metro/src/lib/countLines';

import type { Bundle, MetroSerializer, MetroSerializerOutput, SerializedBundle, VirtualJSOutput } from './utils';
import { createDebugIdSnippet, determineDebugIdFromBundleSource, stringToUUID } from './utils';
import { createDefaultMetroSerializer } from './vendor/metro/utils';

type SourceMap = Record<string, unknown>;

const DEBUG_ID_PLACE_HOLDER = '__debug_id_place_holder__';
const DEBUG_ID_MODULE_PATH = '__debugid__';
const PRELUDE_MODULE_PATH = '__prelude__';
const SOURCE_MAP_COMMENT = '//# sourceMappingURL=';
const DEBUG_ID_COMMENT = '//# debugId=';

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
    const modifiedPreModules = addDebugIdModule(preModules, debugIdModule);

    // Run wrapped serializer
    const serializerResult = serializer(entryPoint, modifiedPreModules, graph, options);
    const { code: bundleCode, map: bundleMapString } = await extractSerializerResult(serializerResult);

    // Add debug id comment to the bundle
    const debugId = determineDebugIdFromBundleSource(bundleCode);
    if (!debugId) {
      throw new Error(
        'Debug ID was not found in the bundle. Call `options.sentryBundleCallback` if you are using a custom serializer.',
      );
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
    const debugId = calculateDebugId(bundle);
    debugIdModule.setSource(injectDebugId(debugIdModule.getSource().toString(), debugId));
    bundle.pre = injectDebugId(bundle.pre, debugId);
    return bundle;
  };
}

function addDebugIdModule(
  preModules: readonly Module<MixedOutput>[],
  debugIdModule: Module<VirtualJSOutput>,
): readonly Module<MixedOutput>[] {
  const modifiedPreModules = [...preModules];
  if (
    modifiedPreModules.length > 0 &&
    modifiedPreModules[0] !== undefined &&
    modifiedPreModules[0].path === PRELUDE_MODULE_PATH
  ) {
    // prelude module must be first as it measures the bundle startup time
    modifiedPreModules.unshift(preModules[0]);
    modifiedPreModules[1] = debugIdModule;
  } else {
    modifiedPreModules.unshift(debugIdModule);
  }
  return modifiedPreModules;
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
  let debugIdCode = createDebugIdSnippet(debugId);

  return {
    setSource: (code: string) => {
      debugIdCode = code;
    },
    dependencies: new Map(),
    getSource: () => Buffer.from(debugIdCode),
    inverseDependencies: new CountingSet(),
    path: DEBUG_ID_MODULE_PATH,
    output: [
      {
        type: 'js/script/virtual',
        data: {
          code: debugIdCode,
          lineCount: countLines(debugIdCode),
          map: [],
        },
      },
    ],
  };
}

function calculateDebugId(bundle: Bundle): string {
  const hash = crypto.createHash('md5');
  hash.update(bundle.pre);
  for (const [, code] of bundle.modules) {
    hash.update(code);
  }
  hash.update(bundle.post);

  const debugId = stringToUUID(hash.digest('hex'));
  return debugId;
}

function injectDebugId(code: string, debugId: string): string {
  return code.replace(new RegExp(DEBUG_ID_PLACE_HOLDER, 'g'), debugId);
}
