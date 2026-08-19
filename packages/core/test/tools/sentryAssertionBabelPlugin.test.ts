import { transformSync } from '@babel/core';

import type { SentryAssertionBabelPluginOptions } from '../../src/js/tools/sentryAssertionBabelPlugin';

import { captureAssertionViolation } from '../../src/js/assertion';
import sentryAssertionBabelPlugin, { CAPTURE_FN } from '../../src/js/tools/sentryAssertionBabelPlugin';

function transform(
  code: string,
  {
    filename = '/app/index.tsx',
    options,
    root,
  }: { filename?: string; options?: SentryAssertionBabelPluginOptions; root?: string } = {},
): string {
  const result = transformSync(code, {
    filename,
    root,
    babelrc: false,
    configFile: false,
    plugins: [options ? [sentryAssertionBabelPlugin, options] : sentryAssertionBabelPlugin],
  });
  return result?.code ?? '';
}

describe('sentryAssertionBabelPlugin', () => {
  it('rewrites an `invariant` call to a non-fatal report on a falsy condition', () => {
    const out = transform(`invariant(total >= 0, 'bad total');`);

    expect(out).toMatch(
      /var _captureAssertionViolation\w* = require\(['"]@sentry\/react-native['"]\)\.captureAssertionViolation/,
    );
    // `cond || report()` — truthy short-circuits, falsy reports.
    expect(out).toMatch(/total >= 0 \|\| _captureAssertionViolation\w*\(\{/);
    expect(out).toContain(`pragma: "invariant"`);
    expect(out).toContain(`condition: "total >= 0"`);
    expect(out).toContain(`message: 'bad total'`);
  });

  it('injects a stable per-site siteId (root-relative when the project root is known)', () => {
    const out = transform(`invariant(ok);`, { filename: '/proj/src/Foo.tsx', root: '/proj' });
    expect(out).toContain(`siteId: "src/Foo.tsx:1:0"`);
  });

  it('falls back to parentDir/basename for the siteId when the file is outside root', () => {
    // No matching root → the path can't be made relative, but a bare basename
    // collides across the many `index.tsx` files an app has. The last two
    // segments keep it disambiguated.
    const out = transform(`invariant(ok);`, { filename: '/proj/src/Foo.tsx' });
    expect(out).toContain(`siteId: "src/Foo.tsx:1:0"`);
  });

  it('does not collide siteIds across files sharing a basename', () => {
    // `screens/index.tsx` and `components/index.tsx` with an assertion at the
    // same line:column must produce distinct siteIds, or the runtime dedup set
    // (keyed by siteId) suppresses the second file's violation entirely.
    const a = transform(`invariant(ok);`, { filename: '/app/src/screens/index.tsx', root: '/app' });
    const b = transform(`invariant(ok);`, { filename: '/app/src/components/index.tsx', root: '/app' });
    expect(a).toContain(`siteId: "src/screens/index.tsx:1:0"`);
    expect(b).toContain(`siteId: "src/components/index.tsx:1:0"`);
    expect(a).not.toEqual(b);
  });

  it('constructs the Error at the call site so its stack top is the assertion site', () => {
    // The `new Error()` is created in the rewritten code (not inside the
    // reporter), so the top frame is the assertion site in dev and release —
    // without relying on framesToPop or the in_app heuristic. It goes through a
    // hoisted global-`Error` alias so a call-site shadow can't break it.
    const out = transform(`invariant(total >= 0, 'bad total');`);
    expect(out).toMatch(/var _Error\d* = typeof globalThis !== ["']undefined["'] \? globalThis\.Error : Error;/);
    expect(out).toMatch(/error: new _Error\d*\(\)/);
  });

  it('is immune to a call-site `Error` shadow (hoisted alias captures the global)', () => {
    // A parameter named `Error` shadows the global at the call site. The hoisted
    // alias at program top captured the real constructor first, so the injected
    // `new _Error()` never resolves to the shadow (which would throw
    // `TypeError: Error is not a constructor` when the assertion fires).
    const out = transform(`function f(Error) {\n  invariant(ok);\n}`);
    expect(out).toMatch(/var _Error\d* = typeof globalThis !== ["']undefined["'] \? globalThis\.Error : Error;/);
    expect(out).toMatch(/error: new _Error\d*\(\)/);
  });

  it('is immune to a module-level `Error` shadow (alias reads globalThis.Error)', () => {
    // A module-scope `const Error` would put the bare `Error` identifier in its
    // TDZ at program top, so `var _Error = Error;` would throw at load time. The
    // alias reads `globalThis.Error` instead, which the lexical shadow can't
    // capture.
    const out = transform(`const Error = 1;\ninvariant(ok);`);
    expect(out).toMatch(/var _Error\d* = typeof globalThis !== ["']undefined["'] \? globalThis\.Error : Error;/);
    expect(out).toMatch(/error: new _Error\d*\(\)/);
  });

  it('emits a `__proto__` value as a computed key, not a prototype setter', () => {
    // `{ __proto__: v }` sets the prototype and throws for a non-object value;
    // the computed form `{ ['__proto__']: v }` keeps it an own data property.
    const out = transform(`const __proto__ = 1;\ninvariant(__proto__ > 0);`);
    expect(out).toMatch(/\[["']__proto__["']\]: __proto__/);
    expect(out).not.toMatch(/\{\s*__proto__: __proto__/);
  });

  it('forwards variadic substitution args as messageArgs for interpolation', () => {
    // RN's Dimensions invariant is `invariant(dims, 'No dimension set for key %s',
    // dimension)` — the extra arg must reach the reporter so `%s` interpolates.
    const out = transform(`invariant(ok, 'No dimension set for key %s', dimension);`);
    expect(out).toContain(`message: 'No dimension set for key %s'`);
    expect(out).toMatch(/messageArgs: \[dimension\]/);
  });

  it('omits messageArgs when the pragma has no args past the message', () => {
    expect(transform(`invariant(ok, 'bad');`)).not.toContain('messageArgs');
    // ...and when there is no message at all.
    expect(transform(`invariant(ok);`)).not.toContain('messageArgs');
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

  it('excludes identifiers bound inside the condition (nested-scope params)', () => {
    // `x` is the arrow parameter — bound inside the condition, so it is out of
    // scope at the call site where `values` is emitted. Capturing it would throw
    // a ReferenceError on the (falsy) report path. `items` (call-site scope) is
    // kept; `x` is dropped.
    const out = transform(`const items = [];\ninvariant(items.every(x => x > 0));`);
    expect(out).toMatch(/values: \{[^}]*\bitems: items\b/);
    expect(out).not.toMatch(/\bx: x\b/);
  });

  it('drops a `let` identifier declared after the call site to avoid a TDZ crash', () => {
    // `x` is a `let` declared textually below the assertion. On a falsy `cond`
    // the original short-circuits and never reads `x`, but the emitted `values`
    // would — hitting its temporal dead zone and throwing a ReferenceError on
    // the report path. `items` (declared above) is kept; `x` is dropped.
    const out = transform(`const items = [];\ninvariant(items.length > 0 && x > 0);\nlet x = 5;`);
    expect(out).toMatch(/values: \{[^}]*\bitems: items\b/);
    expect(out).not.toMatch(/\bx: x\b/);
  });

  it('keeps a call-site identifier shadowed by a nested param of the same name', () => {
    // Outer `items` is referenced as the receiver; the inner `items` param is a
    // different binding. Only the call-site binding is safe to emit.
    const out = transform(`const items = [];\ninvariant(items.every(items => items > 0));`);
    expect(out).toMatch(/values: \{[^}]*\bitems: items\b/);
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
    expect(out).toMatch(/count > 0 \|\| _captureAssertionViolation/);
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
    const bindings = out.match(/require\(['"]@sentry\/react-native['"]\)\.captureAssertionViolation/g)?.length ?? 0;
    expect(bindings).toBe(1);
    const reports = out.match(/_captureAssertionViolation\w*\(\{/g)?.length ?? 0;
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
    expect(out).toMatch(/require\(['"]@sentry\/react-native['"]\)\.captureAssertionViolation/);
    expect(out).not.toMatch(/^\s*import\b/m);
  });

  it('leaves a pragma call used as a subexpression untouched', () => {
    // Rewriting `warning(cond) && next()` to `(cond || report()) && next()`
    // would change the branching (report() is truthy where `warning` returned
    // undefined), so only standalone assertion statements are instrumented.
    const andOut = transform(`warning(cond) && next();`);
    expect(andOut).not.toContain('_captureAssertionViolation');
    expect(andOut).toMatch(/warning\(cond\) && next\(\)/);

    // Same for an assignment / return position.
    const assignOut = transform(`const ok = invariant(cond);`);
    expect(assignOut).not.toContain('_captureAssertionViolation');
  });

  it('leaves non-pragma calls alone', () => {
    const out = transform(`doSomething(a, b);\nfoo.bar(c);`);
    expect(out).not.toContain('@sentry/react-native');
    expect(out).not.toContain('_captureAssertionViolation');
  });

  it('skips calls with no arguments or a leading spread', () => {
    const out = transform(`invariant();\ninvariant(...args);`);
    expect(out).not.toContain('_captureAssertionViolation');
  });

  it('is idempotent — running the plugin twice does not double-instrument', () => {
    const first = transform(`invariant(ok, 'msg');`);
    const second = transform(first);
    const reports = second.match(/_captureAssertionViolation\w*\(\{/g)?.length ?? 0;
    const bindings = second.match(/require\(['"]@sentry\/react-native['"]\)\.captureAssertionViolation/g)?.length ?? 0;
    expect(reports).toBe(1);
    expect(bindings).toBe(1);
  });

  it('skips files inside node_modules by default', () => {
    const out = transform(`invariant(ok);`, { filename: '/proj/node_modules/some-dep/index.js' });
    expect(out).not.toContain('@sentry/react-native');
    expect(out).toMatch(/invariant\(ok\)/);
  });

  it('instruments a first-party file whose path merely contains the node_modules substring', () => {
    // `node_modules` must match a real path segment, not a raw substring — a
    // first-party file named like `node_modules_helper.ts` is not a dependency
    // and must still be instrumented.
    const out = transform(`invariant(ok);`, { filename: '/proj/src/utils/node_modules_helper.ts' });
    expect(out).toContain('@sentry/react-native');
    expect(out).toContain(`pragma: "invariant"`);
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

  it('does not crash the build on a non-array `pragmas`/`rethrowPragmas` option', () => {
    // Metro config is untyped at runtime; a bare string (or any non-array) must
    // fall back to the defaults instead of throwing a `TypeError` at `.includes`.
    const badPragmas = { options: { pragmas: 'invariant' } as unknown as SentryAssertionBabelPluginOptions };
    expect(() => transform(`invariant(ok);`, badPragmas)).not.toThrow();
    // Falls back to DEFAULT_PRAGMAS, so `invariant` is still instrumented.
    expect(transform(`invariant(ok);`, badPragmas)).toContain(`pragma: "invariant"`);

    const badRethrow = { options: { rethrowPragmas: 'invariant' } as unknown as SentryAssertionBabelPluginOptions };
    expect(() => transform(`invariant(ok);`, badRethrow)).not.toThrow();
    // Falls back to DEFAULT_RETHROW_PRAGMAS, so `invariant` still re-throws.
    expect(transform(`invariant(ok);`, badRethrow)).toContain('rethrow: true');
  });

  it('never instruments the Sentry SDK’s own source (installed @sentry path)', () => {
    const out = transform(`import invariant from 'invariant';\ninvariant(ok);`, {
      filename: '/proj/node_modules/@sentry/react-native/dist/js/foo.js',
      options: { includeNodeModules: true },
    });
    expect(out).not.toContain('_captureAssertionViolation');
    expect(out).toMatch(/invariant\(ok\)/);
  });

  it('never instruments the Sentry SDK’s own source on Windows-style paths', () => {
    // Babel hands filenames with backslashes on Windows; the SDK markers are
    // written with forward slashes. Without normalizing the path first the
    // marker never matches and the SDK gets a self-referential reporter
    // injected into its own source.
    const out = transform(`import invariant from 'invariant';\ninvariant(ok);`, {
      filename: 'C:\\proj\\node_modules\\@sentry\\react-native\\dist\\js\\foo.js',
      options: { includeNodeModules: true },
    });
    expect(out).not.toContain('_captureAssertionViolation');
    expect(out).toMatch(/invariant\(ok\)/);
  });

  it('never instruments `@sentry-internal` packages (SDK transitive deps)', () => {
    // `@sentry-internal/*` packages are dependencies of `@sentry/react-native`;
    // instrumenting them injects a require of the SDK into its own dependency
    // graph, creating a circular require that can leave the reporter undefined.
    const out = transform(`import invariant from 'invariant';\ninvariant(ok);`, {
      filename: '/proj/node_modules/@sentry-internal/browser-utils/index.js',
      options: { includeNodeModules: true },
    });
    expect(out).not.toContain('_captureAssertionViolation');
    expect(out).toMatch(/invariant\(ok\)/);
  });

  it('never instruments the Sentry SDK’s own source (monorepo symlink path)', () => {
    // The dev symlink resolves the SDK through a path with no node_modules/@sentry
    // segment, so it must be excluded by the packages/ marker too.
    const out = transform(`invariant(ok);`, {
      filename: '/x/sentry-react-native/packages/core/dist/js/foo.js',
    });
    expect(out).not.toContain('_captureAssertionViolation');
  });

  it('skips a coincidentally-named node_modules pragma that does not resolve to an assertion module', () => {
    // A local function named `invariant` with unrelated semantics must not be
    // miscompiled just because it shares the name.
    const out = transform(`function invariant(x) {}\ninvariant(ok);`, {
      filename: '/proj/node_modules/some-dep/index.js',
      options: { includeNodeModules: true },
    });
    expect(out).not.toContain('_captureAssertionViolation');
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
    expect(excluded).not.toContain('_captureAssertionViolation');
  });

  it('injects a call to the runtime reporter that `@sentry/react-native` actually exports', () => {
    // The plugin emits `require('@sentry/react-native').<CAPTURE_FN>`. If the
    // runtime export is renamed without updating `CAPTURE_FN` (or vice versa),
    // the injected helper resolves to `undefined` and every instrumented
    // assertion throws at runtime — a silent, build-time-invisible break. Assert
    // the two stay coupled.
    expect(typeof captureAssertionViolation).toBe('function');
    expect(captureAssertionViolation.name).toBe(CAPTURE_FN);
    expect(transform(`invariant(ok);`)).toContain(`.${CAPTURE_FN}`);
  });
});
