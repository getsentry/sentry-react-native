import type { MixedOutput, Module } from 'metro';
import type { SerializerConfigT } from 'metro-config';
import * as baseJSBundle from 'metro/src/DeltaBundler/Serializers/baseJSBundle';
import * as sourceMapString from 'metro/src/DeltaBundler/Serializers/sourceMapString';
import * as bundleToString from 'metro/src/lib/bundleToString';
import CountingSet from 'metro/src/lib/CountingSet';
import * as countLines from 'metro/src/lib/countLines';
import { v4 as uuidv4 } from 'uuid';

type SourceMap = Record<string, unknown>;

type ExpectedSerializedConfigThisContext = Partial<SerializerConfigT>

type MetroSerializer = (...args: Parameters<NonNullable<SerializerConfigT['customSerializer']>>)
  => string | { code: string, map: string } | Promise<string | { code: string, map: string }>;

const getDebugIdSnippet = (debugId: string): string => {
  return `var _sentryDebugIds={},_sentryDebugIdIdentifier="";try{var e=Error().stack;e&&(_sentryDebugIds[e]="${debugId}",_sentryDebugIdIdentifier="sentry-dbid-${debugId}")}catch(r){}`;
}

const debugId = uuidv4();
const debugIdCode = getDebugIdSnippet(debugId);
const debugIdModule: Module<{
  type: string;
  data: {
    code: string;
    lineCount: number;
    map: [];
  };
}> = {
  dependencies: new Map(),
  getSource: () => Buffer.from(debugIdCode),
  inverseDependencies: new CountingSet(),
  path: '__debugid__',
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

export const createDefaultMetroSerializer = (
  serializerConfig: Partial<SerializerConfigT>,
): MetroSerializer => {
  return (entryPoint, preModules, graph, options) => {
    const createModuleId = options.createModuleId;
    const getSortedModules = (): Module<MixedOutput>[] => {
      const modules = [...graph.dependencies.values()];
      // Assign IDs to modules in a consistent order
      for (const module of modules) {
        createModuleId(module.path);
      }
      // Sort by IDs
      return modules.sort(
        (a, b) => createModuleId(a.path) - createModuleId(b.path),
      );
    };

    const { code } = bundleToString(baseJSBundle(entryPoint, preModules, graph, options));
    if (serializerConfig.processModuleFilter === undefined) {
      // processModuleFilter is undefined when processing build request from the dev server
      return code;
    }

    // Always generate source maps, can't use Sentry without source maps
    const map = sourceMapString(
      [...preModules, ...getSortedModules()],
      {
        processModuleFilter: serializerConfig.processModuleFilter,
        shouldAddToIgnoreList: options.shouldAddToIgnoreList,
      },
    );
    return { code, map };
  }
};

const PRELUDE_MODULE_PATH = '__prelude__';
const SOURCE_MAP_COMMENT = '//# sourceMappingURL=';
const DEBUG_ID_COMMENT = '//# debugId=';

export const createSentryMetroSerializer = (
  customSerializer?: MetroSerializer,
): MetroSerializer => {
  return async function (
    this: ExpectedSerializedConfigThisContext,
    entryPoint,
    preModules,
    graph,
    options) {
    // eslint-disable-next-line no-console
    console.log('createSentryMetroSerializer', this);
    const serializer = customSerializer || createDefaultMetroSerializer(this);
    // TODO:
    // 1. Deterministically order all the modules (besides assets) preModules and graph dependencies
    // 2. Generate Debug ID using https://github.com/getsentry/sentry-javascript-bundler-plugins/blob/36bf09880f983d562d9179cbbeac40f7083be0ff/packages/bundler-plugin-core/src/utils.ts#L174
    // 3. Only when hermes disabled

    // TODO: Only add debug id if it's not already present
    const modifiedPreModules: Module<MixedOutput>[] = [...preModules];
    if (modifiedPreModules[0].path === PRELUDE_MODULE_PATH) {
      // prelude module must be first as it measures the bundle startup time
      modifiedPreModules.unshift(preModules[0]);
      modifiedPreModules[1] = debugIdModule;
    } else {
      modifiedPreModules.unshift(debugIdModule);
    }

    let bundleCode: string = '';
    let bundleMapString: string = '{}';

    const serializerResult = serializer(entryPoint, preModules, graph, options);
    if (typeof serializerResult === 'string') {
      bundleCode = serializerResult;
    } else if ('map' in serializerResult) {
      bundleCode = serializerResult.code;
      bundleMapString = serializerResult.map;
    } else {
      const awaitedResult = await serializerResult;
      if (typeof awaitedResult === 'string') {
        bundleCode = awaitedResult;
      } else {
        bundleCode = awaitedResult.code;
        bundleMapString = awaitedResult.map;
      }
    }

    // Add debug id comment to the bundle
    const debugIdComment = `${DEBUG_ID_COMMENT}${debugId}`;
    const indexOfSourceMapComment =
      bundleCode.lastIndexOf(SOURCE_MAP_COMMENT);
    const bundleCodeWithDebugId =
      indexOfSourceMapComment === -1
        ? // If source map comment is missing lets just add the debug id comment
        `${bundleCode}\n${debugIdComment}`
        : // If source map comment is present lets add the debug id comment before it
        `${bundleCode.substring(0, indexOfSourceMapComment) +
        debugIdComment
        }\n${bundleCode.substring(indexOfSourceMapComment)}`;

    if (this.processModuleFilter === undefined) {
      // processModuleFilter is undefined when processing build request from the dev server
      return bundleCodeWithDebugId;
    }

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
