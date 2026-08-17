import { transformSync } from '@babel/core';

import type { SentryInvariantBabelPluginOptions } from '../../src/js/tools/sentryInvariantBabelPlugin';

import sentryInvariantBabelPlugin from '../../src/js/tools/sentryInvariantBabelPlugin';

function transform(
  code: string,
  { filename = '/app/index.tsx', options }: { filename?: string; options?: SentryInvariantBabelPluginOptions } = {},
): string {
  const result = transformSync(code, {
    filename,
    babelrc: false,
    configFile: false,
    plugins: [options ? [sentryInvariantBabelPlugin, options] : sentryInvariantBabelPlugin],
  });
  return result?.code ?? '';
}

describe('sentryInvariantBabelPlugin', () => {
  it('rewrites an `invariant` call to a non-fatal report on a falsy condition', () => {
    const out = transform(`invariant(total >= 0, 'bad total');`);

    expect(out).toMatch(
      /var _captureInvariantViolation\w* = require\(['"]@sentry\/react-native['"]\)\.captureInvariantViolation/,
    );
    // `cond || report()` — truthy short-circuits, falsy reports.
    expect(out).toMatch(/total >= 0 \|\| _captureInvariantViolation\w*\(\{/);
    expect(out).toContain(`pragma: "invariant"`);
    expect(out).toContain(`condition: "total >= 0"`);
    expect(out).toContain(`message: 'bad total'`);
  });

  it('injects a stable per-site siteId', () => {
    const out = transform(`invariant(ok);`, { filename: '/proj/src/Foo.tsx' });
    expect(out).toContain(`siteId: "Foo.tsx:1:0"`);
  });

  it('constructs the Error at the call site so its stack top is the assertion site', () => {
    // The bare `new Error()` is created in the rewritten code (not inside the
    // reporter), so the top frame is the assertion site in dev and release —
    // without relying on framesToPop or the in_app heuristic.
    const out = transform(`invariant(total >= 0, 'bad total');`);
    expect(out).toMatch(/error: new Error\(\)/);
  });

  it('attaches the runtime values of identifiers referenced in the condition', () => {
    const out = transform(`const count = 0;\ninvariant(count > 0, 'too few');`);
    expect(out).toMatch(/values: \{\s*count: count\s*\}/);
  });

  it('captures every bound identifier in a computed member condition', () => {
    // `dimensions[dim]` (React Native's Dimensions.js invariant) → both the map
    // and the missing key are surfaced.
    const out = transform(`const dimensions = {};\nconst dim = 'x';\ninvariant(dimensions[dim]);`);
    expect(out).toMatch(/values: \{[^}]*\bdimensions: dimensions\b/);
    expect(out).toMatch(/values: \{[^}]*\bdim: dim\b/);
  });

  it('excludes member properties and unbound globals from values', () => {
    // `a.ready` → capture `a` (bound), not the `ready` property; `Math`/`NaN`
    // have no binding and are dropped as noise.
    const out = transform(`const a = { ready: false };\ninvariant(a.ready && Math.random() > NaN);`);
    expect(out).toMatch(/values: \{[^}]*\ba: a\b/);
    expect(out).not.toMatch(/\bready: ready\b/);
    expect(out).not.toMatch(/\bMath: Math\b/);
    expect(out).not.toMatch(/\bNaN: NaN\b/);
  });

  it('omits the values object when the condition references no bound identifiers', () => {
    const out = transform(`invariant(1 > 0);`);
    expect(out).toContain(`pragma: "invariant"`);
    expect(out).not.toContain('values:');
  });

  it('matches `assert` and `warning` identifiers', () => {
    expect(transform(`assert(x != null);`)).toContain(`pragma: "assert"`);
    expect(transform(`warning(isReady, 'not ready');`)).toContain(`pragma: "warning"`);
  });

  it('matches the `console.assert` member call', () => {
    const out = transform(`console.assert(count > 0, 'empty');`);
    expect(out).toContain(`pragma: "console.assert"`);
    expect(out).toMatch(/count > 0 \|\| _captureInvariantViolation/);
  });

  it('honors a custom pragma set', () => {
    const out = transform(`check(cond);\ninvariant(other);`, { options: { pragmas: ['check'] } });
    expect(out).toContain(`pragma: "check"`);
    // `invariant` is not in the custom set, so it is left untouched.
    expect(out).toMatch(/invariant\(other\)/);
    expect(out).not.toContain(`pragma: "invariant"`);
  });

  it('injects the helper binding exactly once for multiple call sites', () => {
    const out = transform(`invariant(a);\nassert(b);\nwarning(c);`);
    const bindings = out.match(/require\(['"]@sentry\/react-native['"]\)\.captureInvariantViolation/g)?.length ?? 0;
    expect(bindings).toBe(1);
    const reports = out.match(/_captureInvariantViolation\w*\(\{/g)?.length ?? 0;
    expect(reports).toBe(3);
  });

  it('injects a `require` binding (not an ESM import) so it survives in CommonJS files', () => {
    // Regression: an injected ESM `import` is left untouched by Metro's ESM→CJS
    // transform in plain-CommonJS dependency files and Hermes then rejects the
    // bare `import` at release-build time. The helper must be a `require`.
    const out = transform(`const invariant = require('invariant');\ninvariant(ok);`, {
      filename: '/proj/node_modules/some-dep/index.js',
      options: { includeNodeModules: true },
    });
    expect(out).toMatch(/require\(['"]@sentry\/react-native['"]\)\.captureInvariantViolation/);
    expect(out).not.toMatch(/^\s*import\b/m);
  });

  it('leaves non-pragma calls alone', () => {
    const out = transform(`doSomething(a, b);\nfoo.bar(c);`);
    expect(out).not.toContain('@sentry/react-native');
    expect(out).not.toContain('_captureInvariantViolation');
  });

  it('skips calls with no arguments or a leading spread', () => {
    const out = transform(`invariant();\ninvariant(...args);`);
    expect(out).not.toContain('_captureInvariantViolation');
  });

  it('is idempotent — running the plugin twice does not double-instrument', () => {
    const first = transform(`invariant(ok, 'msg');`);
    const second = transform(first);
    const reports = second.match(/_captureInvariantViolation\w*\(\{/g)?.length ?? 0;
    const bindings = second.match(/require\(['"]@sentry\/react-native['"]\)\.captureInvariantViolation/g)?.length ?? 0;
    expect(reports).toBe(1);
    expect(bindings).toBe(1);
  });

  it('skips files inside node_modules by default', () => {
    const out = transform(`invariant(ok);`, { filename: '/proj/node_modules/some-dep/index.js' });
    expect(out).not.toContain('@sentry/react-native');
    expect(out).toMatch(/invariant\(ok\)/);
  });

  it('instruments node_modules when includeNodeModules is set and the pragma resolves to an assertion module', () => {
    const out = transform(`import invariant from 'invariant';\ninvariant(ok);`, {
      filename: '/proj/node_modules/some-dep/index.js',
      options: { includeNodeModules: true },
    });
    expect(out).toContain('@sentry/react-native');
    expect(out).toContain(`pragma: "invariant"`);
  });

  it('emits `rethrow: true` for throwing pragmas and omits it for report-only pragmas', () => {
    // `invariant`/`assert` are hard preconditions — the reporter must re-throw to
    // preserve control flow. `warning`/`console.assert` never threw.
    expect(transform(`invariant(ok);`)).toContain('rethrow: true');
    expect(transform(`assert(ok);`)).toContain('rethrow: true');
    expect(transform(`warning(ok, 'w');`)).not.toContain('rethrow');
    expect(transform(`console.assert(ok, 'c');`)).not.toContain('rethrow');
  });

  it('honors a custom rethrowPragmas set', () => {
    expect(transform(`warning(ok, 'w');`, { options: { rethrowPragmas: ['warning'] } })).toContain('rethrow: true');
    expect(transform(`invariant(ok);`, { options: { rethrowPragmas: [] } })).not.toContain('rethrow');
  });

  it('never instruments the Sentry SDK’s own source (installed @sentry path)', () => {
    const out = transform(`import invariant from 'invariant';\ninvariant(ok);`, {
      filename: '/proj/node_modules/@sentry/react-native/dist/js/foo.js',
      options: { includeNodeModules: true },
    });
    expect(out).not.toContain('_captureInvariantViolation');
    expect(out).toMatch(/invariant\(ok\)/);
  });

  it('never instruments the Sentry SDK’s own source (monorepo symlink path)', () => {
    // The dev symlink resolves the SDK through a path with no node_modules/@sentry
    // segment, so it must be excluded by the packages/ marker too.
    const out = transform(`invariant(ok);`, {
      filename: '/x/sentry-react-native/packages/core/dist/js/foo.js',
    });
    expect(out).not.toContain('_captureInvariantViolation');
  });

  it('skips a coincidentally-named node_modules pragma that does not resolve to an assertion module', () => {
    // A local function named `invariant` with unrelated semantics must not be
    // miscompiled just because it shares the name.
    const out = transform(`function invariant(x) {}\ninvariant(ok);`, {
      filename: '/proj/node_modules/some-dep/index.js',
      options: { includeNodeModules: true },
    });
    expect(out).not.toContain('_captureInvariantViolation');
  });

  it('always instruments console.assert in node_modules (member pragma bypasses import resolution)', () => {
    const out = transform(`console.assert(ok, 'c');`, {
      filename: '/proj/node_modules/some-dep/index.js',
      options: { includeNodeModules: true },
    });
    expect(out).toContain(`pragma: "console.assert"`);
  });

  it('requireResolvedImport:false instruments node_modules pragmas without import resolution', () => {
    const out = transform(`invariant(ok);`, {
      filename: '/proj/node_modules/some-dep/index.js',
      options: { includeNodeModules: true, requireResolvedImport: false },
    });
    expect(out).toContain(`pragma: "invariant"`);
  });

  it('instruments only allowlisted node_modules paths when includeNodeModules is an array', () => {
    const options = {
      includeNodeModules: ['react-native/Libraries/Utilities'],
      requireResolvedImport: false,
    };
    const included = transform(`invariant(ok);`, {
      filename: '/proj/node_modules/react-native/Libraries/Utilities/Dimensions.js',
      options,
    });
    expect(included).toContain(`pragma: "invariant"`);

    const excluded = transform(`invariant(ok);`, {
      filename: '/proj/node_modules/other-dep/index.js',
      options,
    });
    expect(excluded).not.toContain('_captureInvariantViolation');
  });
});
