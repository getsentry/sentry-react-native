const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');
const blacklist = require('metro-config/src/defaults/exclusionList');
const bundleToString = require('metro/src/lib/bundleToString');
const baseJSBundle = require('metro/src/DeltaBundler/Serializers/baseJSBundle');
const sourceMapString = require('metro/src/DeltaBundler/Serializers/sourceMapString');
const CountingSet = require('metro/src/lib/CountingSet').default;
const countLines = require('metro/src/lib/countLines');
const uuidv4 = require('uuid').v4;

const parentDir = path.resolve(__dirname, '..');

function getDebugIdSnippet(debugId) {
  return `var _sentryDebugIds={},_sentryDebugIdIdentifier="";try{var e=Error().stack;e&&(_sentryDebugIds[e]="${debugId}",_sentryDebugIdIdentifier="sentry-dbid-${debugId}")}catch(r){}`;
}

const debugId = uuidv4();
const debugIdCode = getDebugIdSnippet(debugId);
const debugIdModule = {
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
const defaultSerializer = (entryPoint, preModules, graph, options) =>
  bundleToString(baseJSBundle(entryPoint, preModules, graph, options)).code;
const PRELUDE_MODULE_PATH = '__prelude__';
const SOURCE_MAP_COMMENT = '//# sourceMappingURL=';
const DEBUG_ID_COMMENT = '//# debugId=';

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  projectRoot: __dirname,
  watchFolders: [
    path.resolve(__dirname, 'node_modules'),
    `${parentDir}/dist`,
    `${parentDir}/node_modules`,
  ],
  resolver: {
    blacklistRE: blacklist([
      new RegExp(`${parentDir}/node_modules/react-native/.*`),
      new RegExp(`.*\\android\\.*`), // Required for Windows in order to run the Sample.
    ]),
    extraNodeModules: new Proxy(
      {
        /*
           As the parent dir node_modules is blacklisted as you can see above. So it won't be able
           to find react-native to build the code from the parent folder,
           so we'll have to redirect it to use the react-native inside sample's node_modules.
         */
        'react-native': path.resolve(__dirname, 'node_modules/react-native'),
      },
      {
        get: (target, name) => {
          if (target.hasOwnProperty(name)) {
            return target[name];
          }
          return path.join(process.cwd(), `node_modules/${name}`);
        },
      },
    ),
  },
  serializer: {
    customSerializer: function (entryPoint, preModules, graph, options) {
      const createModuleId = options.createModuleId;
      const getSortedModules = () => {
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

      // TODO:
      // 1. Deterministically order all the modules (besides assets) preModules and graph dependencies
      // 2. Generate Debug ID using https://github.com/getsentry/sentry-javascript-bundler-plugins/blob/36bf09880f983d562d9179cbbeac40f7083be0ff/packages/bundler-plugin-core/src/utils.ts#L174

      // TODO: Only add debug id if it's not already present
      if (preModules[0].path === PRELUDE_MODULE_PATH) {
        // prelude module must be first as it measures the bundle startup time
        preModules.unshift(preModules[0]);
        preModules[1] = debugIdModule;
      } else {
        preModules.unshift(debugIdModule);
      }

      const bundleCode = defaultSerializer(
        entryPoint,
        preModules,
        graph,
        options,
      );

      // Add debug id comment to the bundle
      const debugIdComment = `${DEBUG_ID_COMMENT}${debugId}`;
      const indexOfSourceMapComment =
        bundleCode.lastIndexOf(SOURCE_MAP_COMMENT);
      const bundleCodeWithDebugId =
        indexOfSourceMapComment === -1
          ? // If source map comment is missing lets just add the debug id comment
            bundleCode + '\n' + debugIdComment
          : // If source map comment is present lets add the debug id comment before it
            bundleCode.substring(0, indexOfSourceMapComment) +
            debugIdComment +
            '\n' +
            bundleCode.substring(indexOfSourceMapComment);

      if (this.processModuleFilter === undefined) {
        // processModuleFilter is undefined when processing build request from the dev server
        return bundleCodeWithDebugId;
      }

      // Generate bundle map
      const bundleMapString = sourceMapString(
        [...preModules, ...getSortedModules(graph)],
        {
          processModuleFilter: this.processModuleFilter,
          shouldAddToIgnoreList: options.shouldAddToIgnoreList,
        },
      );
      const bundleMap = JSON.parse(bundleMapString);
      // For now we write both fields until we know what will become the standard - if ever.
      bundleMap['debug_id'] = debugId;
      bundleMap['debugId'] = debugId;

      return {
        code: bundleCodeWithDebugId,
        map: JSON.stringify(bundleMap),
      };
    },
  },
};

const m = mergeConfig(getDefaultConfig(__dirname), config);
// m.transformer.getTransformOptions().then(opts => {
//   console.log(opts);
// });
module.exports = m;
