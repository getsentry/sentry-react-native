import * as fs from 'fs';
import type { MixedOutput, Module } from 'metro';
// eslint-disable-next-line import/no-unresolved
import CountingSet from 'metro/private/lib/CountingSet';
// eslint-disable-next-line import/no-unresolved
import * as countLines from 'metro/private/lib/countLines';
import { minify } from 'uglify-js';
import { createSentryMetroSerializer } from '../../src/js/tools/sentryMetroSerializer';
import { type MetroSerializer, type VirtualJSOutput, createDebugIdSnippet } from '../../src/js/tools/utils';

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
