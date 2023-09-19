import * as crypto from 'crypto';
import type { MixedOutput, Module } from 'metro';
import type { SerializerConfigT } from 'metro-config';
import * as baseJSBundle from 'metro/src/DeltaBundler/Serializers/baseJSBundle';
import * as sourceMapString from 'metro/src/DeltaBundler/Serializers/sourceMapString';
import * as bundleToString from 'metro/src/lib/bundleToString';
import CountingSet from 'metro/src/lib/CountingSet';
import * as countLines from 'metro/src/lib/countLines';

type SourceMap = Record<string, unknown>;

type ExpectedSerializedConfigThisContext = Partial<SerializerConfigT>

type MetroSerializer = (...args: Parameters<NonNullable<SerializerConfigT['customSerializer']>>)
  => string | { code: string, map: string } | Promise<string | { code: string, map: string }>;

type MetroSerializerOptions = Parameters<MetroSerializer>[3];

const DEBUG_ID_MODULE_PATH = '__debugid__';
const PRELUDE_MODULE_PATH = '__prelude__';
const SOURCE_MAP_COMMENT = '//# sourceMappingURL=';
const DEBUG_ID_COMMENT = '//# debugId=';

const createDebugIdSnippet = (debugId: string): string => {
  return `var _sentryDebugIds={},_sentryDebugIdIdentifier="";try{var e=Error().stack;e&&(_sentryDebugIds[e]="${debugId}",_sentryDebugIdIdentifier="sentry-dbid-${debugId}")}catch(r){}`;
}

const createDebugIdModule = (debugId: string): Module<{
  type: string;
  data: {
    code: string;
    lineCount: number;
    map: [];
  };
}> => {
  const debugIdCode = createDebugIdSnippet(debugId);

  return {
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
};

/**
 * Deterministically hashes a string and turns the hash into a uuid.
 * https://github.com/getsentry/sentry-javascript-bundler-plugins/blob/58271f1af2ade6b3e64d393d70376ae53bc5bd2f/packages/bundler-plugin-core/src/utils.ts#L174
 */
export function stringToUUID(str: string): string {
  const md5sum = crypto.createHash('md5');
  md5sum.update(str);
  const md5Hash = md5sum.digest('hex');

  // Position 16 is fixed to either 8, 9, a, or b in the uuid v4 spec (10xx in binary)
  // RFC 4122 section 4.4
  const v4variant = ['8', '9', 'a', 'b'][md5Hash.substring(16, 17).charCodeAt(0) % 4] as string;

  return (
    `${md5Hash.substring(0, 8)
    }-${
    md5Hash.substring(8, 12)
    }-4${
    md5Hash.substring(13, 16)
    }-${
    v4variant
    }${md5Hash.substring(17, 20)
    }-${
    md5Hash.substring(20)}`
  ).toLowerCase();
}

const calculateDebugId = (modules: readonly Module<MixedOutput>[], serializerOptions: MetroSerializerOptions): string => {
  const createModuleId = serializerOptions.createModuleId;
  const sortedModules = [...modules].sort((a, b) => createModuleId(a.path) - createModuleId(b.path));

  const hash = crypto.createHash('md5');
  for (const module of sortedModules) {
    for (const output of module.output) {
      if (!output.type.startsWith('js/script')) {
        continue;
      }

      const code = output.data.code;
      if (typeof code === 'string' && code.length > 0) {
        hash
          .update('\0', 'utf8')
          .update(code, 'utf8');
      }
    }
  }

  const debugId = stringToUUID(hash.digest('hex'));
  // eslint-disable-next-line no-console
  console.log('info ' + `Bundle Debug ID: ${debugId}`);
  return debugId;
}

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

export const createSentryMetroSerializer = (
  customSerializer?: MetroSerializer,
  ): MetroSerializer => {
    return async function (
      this: ExpectedSerializedConfigThisContext,
      entryPoint,
      preModules,
      graph,
      options) {
    // TODO: Exclude Debug ID Module for Hermes builds with SDK capable reading Hermes Bytecode Hash
    const serializer = customSerializer || createDefaultMetroSerializer(this);
    const debugId = calculateDebugId([...preModules, ...graph.dependencies.values()], options);

    // Add debug id module to the preModules
    let modifiedPreModules: readonly Module<MixedOutput>[];
    const containsDebugIdModule = preModules.some((module) => module.path === DEBUG_ID_MODULE_PATH);
    if (!containsDebugIdModule) {
      const debugIdModule = createDebugIdModule(debugId);
      const tmpPreModules = [...preModules];
      if (tmpPreModules[0].path === PRELUDE_MODULE_PATH) {
        // prelude module must be first as it measures the bundle startup time
        tmpPreModules.unshift(preModules[0]);
        tmpPreModules[1] = debugIdModule;
      } else {
        tmpPreModules.unshift(debugIdModule);
      }
      modifiedPreModules = tmpPreModules;
    } else {
      modifiedPreModules = preModules;
    }

    let bundleCode: string = '';
    let bundleMapString: string = '{}';

    // Run wrapped serializer
    const serializerResult = serializer(entryPoint, modifiedPreModules, graph, options);
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
