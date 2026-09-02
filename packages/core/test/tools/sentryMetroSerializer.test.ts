import type { MixedOutput, Module } from 'metro';

import * as fs from 'fs';
import CountingSet from 'metro/private/lib/CountingSet';
import countLines from 'metro/private/lib/countLines';
import * as os from 'os';
import * as path from 'path';
import { minify } from 'uglify-js';

import { createSentryMetroSerializer } from '../../src/js/tools/sentryMetroSerializer';
import { createDebugIdSnippet, type MetroSerializer, type VirtualJSOutput } from '../../src/js/tools/utils';

describe('Sentry Metro Serializer', () => {
  test('debug id minified code snippet is the same as in the original implementation', () => {
    const original = fs.readFileSync(`${__dirname}/../../scripts/sentry-debugid-injection-snippet.js`, 'utf8');
    const minified = minify(original).code;
    const snippet = createDebugIdSnippet('__SENTRY_DEBUG_ID__');
    expect(minified).toEqual(snippet);
  });

  test('generates bundle and source map with deterministic uuidv5 debug id', async () => {
    const serializer = createSentryMetroSerializer();

    const bundle = await serializer(...mockMinSerializerArgs());
    if (typeof bundle === 'string') {
      fail('Expected bundle to be an object with a "code" property');
    }

    expect(bundle.code).toEqual(
      'var _sentryDebugIds,_sentryDebugIdIdentifier;void 0===_sentryDebugIds&&(_sentryDebugIds={});try{var stack=(new Error).stack;stack&&(_sentryDebugIds[stack]="c9e276ed-1171-4e26-ac5d-0193a85ed160",_sentryDebugIdIdentifier="sentry-dbid-c9e276ed-1171-4e26-ac5d-0193a85ed160")}catch(e){}\n//# debugId=c9e276ed-1171-4e26-ac5d-0193a85ed160',
    );
    expect(bundle.map).toEqual(
      '{"version":3,"sources":["__debugid__"],"sourcesContent":["var _sentryDebugIds,_sentryDebugIdIdentifier;void 0===_sentryDebugIds&&(_sentryDebugIds={});try{var stack=(new Error).stack;stack&&(_sentryDebugIds[stack]=\\"c9e276ed-1171-4e26-ac5d-0193a85ed160\\",_sentryDebugIdIdentifier=\\"sentry-dbid-c9e276ed-1171-4e26-ac5d-0193a85ed160\\")}catch(e){}"],"names":[],"mappings":"","debug_id":"c9e276ed-1171-4e26-ac5d-0193a85ed160","debugId":"c9e276ed-1171-4e26-ac5d-0193a85ed160"}',
    );
  });

  test('generated debug id is uuid v4 format', async () => {
    const serializer = createSentryMetroSerializer();
    const bundle = await serializer(...mockMinSerializerArgs());
    const debugId = determineDebugIdFromBundleSource(typeof bundle === 'string' ? bundle : bundle.code);
    expect(debugId).toEqual('c9e276ed-1171-4e26-ac5d-0193a85ed160');
  });

  test('adds debug id snipped after prelude module and before ', async () => {
    const serializer = createSentryMetroSerializer();

    const bundle = await serializer(...mockWithPreludeAndDepsSerializerArgs());
    if (typeof bundle === 'string') {
      fail('Expected bundle to be an object with a "code" property');
    }

    expect(bundle.code).toEqual(fs.readFileSync(`${__dirname}/fixtures/bundleWithPrelude.js.fixture`, 'utf8'));
    expect(bundle.map).toEqual(fs.readFileSync(`${__dirname}/fixtures/bundleWithPrelude.js.fixture.map`, 'utf8'));
  });

  test('works when shouldAddToIgnoreList is undefined', async () => {
    const serializer = createSentryMetroSerializer();
    const args = mockMinSerializerArgs({ shouldAddToIgnoreList: undefined });

    const bundle = await serializer(...args);

    expect(bundle).toBeDefined();
    if (typeof bundle !== 'string') {
      expect(bundle.code).toBeDefined();
      expect(bundle.map).toBeDefined();
      const debugId = determineDebugIdFromBundleSource(bundle.code);
      expect(debugId).toMatch(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);
    }
  });

  test('calculates debug id from bundle code when debug id module is not found', async () => {
    // Create a custom serializer that returns bundle code without the debug ID module
    const customSerializer: MetroSerializer = async () => {
      const bundleCodeWithoutDebugId = 'console.log("test bundle");';
      return {
        code: bundleCodeWithoutDebugId,
        map: '{"version":3,"sources":[],"names":[],"mappings":""}',
      };
    };

    const serializer = createSentryMetroSerializer(customSerializer);
    const bundle = await serializer(...mockMinSerializerArgs());

    if (typeof bundle === 'string') {
      fail('Expected bundle to be an object with a "code" property');
    }

    // The debug ID should be calculated from the bundle code content
    // and added as a comment in the bundle code
    expect(bundle.code).toContain('//# debugId=');

    // Extract the debug ID from the comment
    const debugIdMatch = bundle.code.match(/\/\/# debugId=([0-9a-fA-F-]+)/);
    expect(debugIdMatch).toBeTruthy();
    const debugId = debugIdMatch?.[1];

    // Verify it's a valid UUID format
    expect(debugId).toMatch(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);

    // Verify the debug ID is also in the source map
    const sourceMap = JSON.parse(bundle.map);
    expect(sourceMap.debug_id).toBe(debugId);
    expect(sourceMap.debugId).toBe(debugId);

    // The calculated debug ID should be deterministic based on the bundle content
    // Running the serializer again with the same content should produce the same debug ID
    const bundle2 = await serializer(...mockMinSerializerArgs());
    if (typeof bundle2 !== 'string') {
      const debugIdMatch2 = bundle2.code.match(/\/\/# debugId=([0-9a-fA-F-]+)/);
      expect(debugIdMatch2?.[1]).toBe(debugId);
    }
  });

  test('does not crash when wrapped serializer returns an array (Expo static export)', async () => {
    // Expo's Metro serializer returns a non-standard output (e.g. an array of serial assets)
    // when doing a static/EAS Update export. The array must not be mistaken for a { code, map }
    // bundle. Note `'map' in []` is `true` because of Array.prototype.map, which used to make the
    // serializer return `{ code: undefined }` and crash in determineDebugIdFromBundleSource.
    // https://github.com/getsentry/sentry-react-native/issues/6650
    const serialAssets = [{ filename: 'index.js', source: 'console.log("a");' }];
    const customSerializer = (() => serialAssets) as unknown as MetroSerializer;

    const serializer = createSentryMetroSerializer(customSerializer);
    const bundle = await serializer(...mockMinSerializerArgs());

    // The original non-standard result is returned untouched (no debug ID injection, no crash).
    expect(bundle).toBe(serialAssets);
  });

  test('does not crash when wrapped serializer returns a promise resolving to an array', async () => {
    const serialAssets = [{ filename: 'index.js', source: 'console.log("a");' }];
    const customSerializer = (() => Promise.resolve(serialAssets)) as unknown as MetroSerializer;

    const serializer = createSentryMetroSerializer(customSerializer);
    const bundle = await serializer(...mockMinSerializerArgs());

    expect(bundle).toBe(serialAssets);
  });

  describe('calculateDebugId', () => {
    // We need to access the private function for testing
    const crypto = require('crypto');
    const { stringToUUID } = require('../../src/js/tools/utils');

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

    test('generates a valid UUID v4 format', () => {
      const bundleCode = 'console.log("test");';
      const debugId = calculateDebugId(bundleCode);

      expect(debugId).toMatch(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);
    });

    test('generates deterministic debug ID for the same bundle code', () => {
      const bundleCode = 'console.log("test");';
      const debugId1 = calculateDebugId(bundleCode);
      const debugId2 = calculateDebugId(bundleCode);

      expect(debugId1).toBe(debugId2);
    });

    test('generates different debug IDs for different bundle code', () => {
      const bundleCode1 = 'console.log("test1");';
      const bundleCode2 = 'console.log("test2");';
      const debugId1 = calculateDebugId(bundleCode1);
      const debugId2 = calculateDebugId(bundleCode2);

      expect(debugId1).not.toBe(debugId2);
    });

    test('handles undefined modules parameter', () => {
      const bundleCode = 'console.log("test");';
      const debugId = calculateDebugId(bundleCode, undefined);

      expect(debugId).toMatch(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);
    });

    test('handles empty modules array', () => {
      const bundleCode = 'console.log("test");';
      const debugId1 = calculateDebugId(bundleCode, []);
      const debugId2 = calculateDebugId(bundleCode);

      // Should generate the same debug ID as without modules
      expect(debugId1).toBe(debugId2);
    });

    test('includes modules in debug ID calculation', () => {
      const bundleCode = 'console.log("test");';
      const modules: Array<[id: number, code: string]> = [
        [1, 'function foo() { return "bar"; }'],
        [2, 'function baz() { return "qux"; }'],
      ];

      const debugIdWithModules = calculateDebugId(bundleCode, modules);
      const debugIdWithoutModules = calculateDebugId(bundleCode);

      expect(debugIdWithModules).not.toBe(debugIdWithoutModules);
    });

    test('generates different debug IDs when modules differ', () => {
      const bundleCode = 'console.log("test");';
      const modules1: Array<[id: number, code: string]> = [[1, 'function foo() { return "bar"; }']];
      const modules2: Array<[id: number, code: string]> = [[1, 'function foo() { return "baz"; }']];

      const debugId1 = calculateDebugId(bundleCode, modules1);
      const debugId2 = calculateDebugId(bundleCode, modules2);

      expect(debugId1).not.toBe(debugId2);
    });

    test('generates same debug ID when modules have same content but different IDs', () => {
      const bundleCode = 'console.log("test");';
      const modules1: Array<[id: number, code: string]> = [[1, 'function foo() { return "bar"; }']];
      const modules2: Array<[id: number, code: string]> = [[2, 'function foo() { return "bar"; }']];

      const debugId1 = calculateDebugId(bundleCode, modules1);
      const debugId2 = calculateDebugId(bundleCode, modules2);

      // Module IDs are not used in the hash calculation, only the code
      expect(debugId1).toBe(debugId2);
    });

    test('generates different debug IDs when module order differs', () => {
      const bundleCode = 'console.log("test");';
      const modules1: Array<[id: number, code: string]> = [
        [1, 'function foo() { return "bar"; }'],
        [2, 'function baz() { return "qux"; }'],
      ];
      const modules2: Array<[id: number, code: string]> = [
        [2, 'function baz() { return "qux"; }'],
        [1, 'function foo() { return "bar"; }'],
      ];

      const debugId1 = calculateDebugId(bundleCode, modules1);
      const debugId2 = calculateDebugId(bundleCode, modules2);

      // Order matters in hash calculation
      expect(debugId1).not.toBe(debugId2);
    });

    test('handles empty bundle code', () => {
      const debugId = calculateDebugId('');

      expect(debugId).toMatch(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);
    });

    test('handles large bundle code', () => {
      const largeBundleCode = 'console.log("test");'.repeat(10000);
      const debugId = calculateDebugId(largeBundleCode);

      expect(debugId).toMatch(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);
    });
  });

  test('createDefaultMetroSerializer can be created without Metro internals being loaded at import time', () => {
    // This test verifies that the lazy-loading of Metro internals works correctly.
    // The createDefaultMetroSerializer function should be callable without triggering
    // module-level requires of Metro internals at import time.
    // See: https://github.com/getsentry/sentry-react-native/issues/5957

    // Import the function
    const { createDefaultMetroSerializer: createSerializer } = require('../../src/js/tools/vendor/metro/utils');

    // Create the serializer - this should succeed without loading Metro internals
    const serializer = createSerializer();
    expect(typeof serializer).toBe('function');

    // Verify the serializer can be invoked with proper arguments and produces output
    const [entryPoint, preModules, graph, options] = mockMinSerializerArgs();
    const result = serializer(entryPoint, preModules, graph, options);

    expect(result).toHaveProperty('code');
    expect(result).toHaveProperty('map');
    expect(typeof result.code).toBe('string');
    expect(typeof result.map).toBe('string');
    // Both code and map should exist (even if minimal for empty bundle)
    expect(result.code).toBeDefined();
    expect(result.map).toBeDefined();
  });

  describe('resolves Metro internals from the project root', () => {
    // See: https://github.com/getsentry/sentry-react-native/pull/6625
    // The default serializer must load Metro internals from the app being bundled (`options.projectRoot`)
    // rather than the Metro resolvable from the SDK's own location. Otherwise, when a different Metro
    // version is nested under the SDK (monorepo / from-source install), source maps are generated with
    // the wrong Metro.
    const createdFixtures: string[] = [];

    afterEach(() => {
      while (createdFixtures.length) {
        fs.rmSync(createdFixtures.pop() as string, { recursive: true, force: true });
      }
    });

    // Writes a fake `metro` package to a temp project root, exposing the three internals the default
    // serializer needs. `layout` selects whether they are exposed via the newer `metro/private/*` path
    // or the legacy `metro/src/*` path. Each internal is a sentinel so we can assert which Metro ran.
    function writeFakeMetro(marker: string, layout: 'private' | 'src', brokenSourceMap = false): string {
      const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-metro-fixture-')));
      createdFixtures.push(root);

      const write = (rel: string, contents: string): void => {
        const abs = path.join(root, 'node_modules', 'metro', layout, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, contents);
      };

      // No `exports` map: subpaths resolve directly to real files under the chosen layout.
      fs.mkdirSync(path.join(root, 'node_modules', 'metro'), { recursive: true });
      fs.writeFileSync(
        path.join(root, 'node_modules', 'metro', 'package.json'),
        JSON.stringify({ name: 'metro', version: `0.0.0-${marker}` }),
      );
      write('DeltaBundler/Serializers/baseJSBundle.js', 'module.exports = { baseJSBundle: () => ({}) };');
      write('lib/bundleToString.js', `module.exports = { bundleToString: () => ({ code: '${marker}_CODE' }) };`);
      write(
        'DeltaBundler/Serializers/sourceMapString.js',
        // `brokenSourceMap` exposes a non-callable sourceMapString to simulate a Metro whose shape/path
        // we can't resolve, used to assert the hot path doesn't touch it.
        brokenSourceMap
          ? 'module.exports = { notSourceMapString: 1 };'
          : `module.exports = { sourceMapString: () => '${marker}_MAP' };`,
      );

      return root;
    }

    function serializeWithProjectRootHot(projectRoot: string): unknown {
      const { createDefaultMetroSerializer } = require('../../src/js/tools/vendor/metro/utils');
      const serializer = createDefaultMetroSerializer();
      const [entryPoint, preModules, graph, options] = mockMinSerializerArgs();
      return serializer(
        entryPoint,
        preModules,
        { ...graph, transformOptions: { ...graph.transformOptions, hot: true } },
        { ...options, projectRoot, sentryBundleCallback: undefined },
      );
    }

    function serializeWithProjectRoot(projectRoot: string): { code: unknown; map: unknown } {
      const { createDefaultMetroSerializer } = require('../../src/js/tools/vendor/metro/utils');
      const serializer = createDefaultMetroSerializer();
      const [entryPoint, preModules, graph, options] = mockMinSerializerArgs();
      return serializer(
        entryPoint,
        preModules,
        { ...graph, transformOptions: { ...graph.transformOptions, hot: false } },
        {
          ...options,
          projectRoot,
          sentryBundleCallback: undefined,
        },
      );
    }

    test("prefers the app's Metro at projectRoot over the SDK's Metro", () => {
      const appRoot = writeFakeMetro('APP', 'private');

      const result = serializeWithProjectRoot(appRoot);

      // Sentinel output proves the fake Metro at projectRoot ran, not the real Metro resolvable from the SDK.
      expect(result.code).toBe('APP_CODE');
      expect(result.map).toBe('APP_MAP');
    });

    test("uses the app's Metro even when it only exposes internals via metro/src/* and the SDK exposes metro/private/*", () => {
      // Regression guard for the resolution-order bug: the app's Metro must win by location, even though
      // the SDK's real Metro exposes the newer `metro/private/*` path shape and the app's only exposes
      // the legacy `metro/src/*` path shape. Ordering path shape above location would pick the SDK's Metro.
      const appRoot = writeFakeMetro('APPSRC', 'src');

      const result = serializeWithProjectRoot(appRoot);

      expect(result.code).toBe('APPSRC_CODE');
      expect(result.map).toBe('APPSRC_MAP');
    });

    test('resolves sourceMapString lazily, so the hot/dev path works even if sourceMapString is unresolvable', () => {
      // Regression guard for the dev-server break: sourceMapString is only used for non-hot (production)
      // builds, so an unresolvable sourceMapString must not throw during `yarn start`.
      const appRoot = writeFakeMetro('HOT', 'private', /* brokenSourceMap */ true);

      const result = serializeWithProjectRootHot(appRoot);

      // Hot path returns code only and must not have thrown resolving the broken sourceMapString.
      expect(result).toBe('HOT_CODE');
    });

    test('still throws for an unresolvable sourceMapString on the non-hot path', () => {
      // The guard must still fire where sourceMapString is actually needed.
      const appRoot = writeFakeMetro('COLD', 'private', /* brokenSourceMap */ true);

      expect(() => serializeWithProjectRoot(appRoot)).toThrow(/sourceMapString/);
    });
  });
});

function mockMinSerializerArgs(options?: {
  shouldAddToIgnoreList?: ((module: Module<MixedOutput>) => boolean) | undefined;
}): Parameters<MetroSerializer> {
  let modulesCounter = 0;

  const baseOptions: Record<string, any> = {
    asyncRequireModulePath: 'asyncRequire',
    createModuleId: (_filePath: string): number => modulesCounter++,
    dev: false,
    getRunModuleStatement: (_moduleId: string | number): string => '',
    includeAsyncPaths: false,
    modulesOnly: false,
    processModuleFilter: (_module: Module<MixedOutput>) => true,
    projectRoot: '/project/root',
    runBeforeMainModule: [],
    runModule: false,
    serverRoot: '/server/root',
  };

  if (options && 'shouldAddToIgnoreList' in options) {
    baseOptions.shouldAddToIgnoreList = options.shouldAddToIgnoreList;
  } else {
    baseOptions.shouldAddToIgnoreList = (_module: Module<MixedOutput>) => false;
  }

  return [
    'index.js',
    [],
    {
      entryPoints: new Set(),
      dependencies: new Map(),
      transformOptions: {
        hot: false,
        dev: false,
        minify: false,
        type: 'script',
        unstable_transformProfile: 'hermes-stable',
      },
    },
    baseOptions as any,
  ];
}

function mockWithPreludeAndDepsSerializerArgs(): Parameters<MetroSerializer> {
  const mockPreludeCode = '__mock_prelude__';
  const indexJsCode = '__mock_index_js__';
  const args = mockMinSerializerArgs();
  args[1] = [
    {
      dependencies: new Map(),
      getSource: () => Buffer.from(mockPreludeCode),
      inverseDependencies: new CountingSet(),
      path: '__prelude__',
      output: [
        <VirtualJSOutput>{
          type: 'js/script/virtual',
          data: {
            code: mockPreludeCode,
            lineCount: countLines(indexJsCode),
            map: [],
          },
        },
      ],
    },
  ];

  // @ts-expect-error - This is a mock
  args[2].dependencies = <Parameters<MetroSerializer>[2]['dependencies']>new Map([
    [
      'index.js',
      <Module<VirtualJSOutput>>{
        dependencies: new Map(),
        getSource: () => Buffer.from(indexJsCode),
        inverseDependencies: new CountingSet(),
        path: 'index.js',
        output: [
          {
            type: 'js/script/virtual',
            data: {
              code: indexJsCode,
              lineCount: countLines(indexJsCode),
              map: [],
            },
          },
        ],
      },
    ],
  ]);

  return args;
}

/**
 * This function is on purpose not shared with the actual implementation.
 */
function determineDebugIdFromBundleSource(code: string): string | undefined {
  const match = code.match(
    /sentry-dbid-([0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12})/,
  );
  return match?.[1];
}
