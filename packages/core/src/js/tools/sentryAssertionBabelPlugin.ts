import type { NodePath, PluginObj, PluginPass, types as BabelTypes } from '@babel/core';

/**
 * Babel plugin that rewrites assertion call sites so a violated assertion is
 * reported to Sentry as a non-fatal (handled) event instead of being stripped
 * from the release bundle or crashing with a minified, unreadable message.
 *
 * It matches calls whose callee is one of the configured pragmas — by default
 * `invariant`, `assert`, `warning` and `console.assert` — all of which fire on a
 * **falsy** first argument. Each match:
 *
 * ```ts
 * invariant(total >= 0, 'bad total');
 * ```
 *
 * is rewritten to short-circuit on the condition and report only when it is
 * falsy:
 *
 * ```ts
 * var _captureAssertionViolation = require('@sentry/react-native').captureAssertionViolation;
 * // ...
 * total >= 0 || _captureAssertionViolation({
 *   pragma: 'invariant',
 *   condition: 'total >= 0',
 *   values: { total: total },
 *   message: 'bad total',
 *   siteId: 'index.tsx:1:0',
 *   rethrow: true,
 *   error: new Error(),
 * });
 * ```
 *
 * ## Preserving control flow (`rethrow`)
 *
 * `invariant`/`assert` are **hard preconditions**: downstream code relies on the
 * throw having happened (`invariant(user); return user.name;`). Silently swapping
 * the throw for a report would let execution continue past a violated
 * precondition and turn a clean, localized failure into a confusing downstream
 * crash or silent state corruption. So for the pragmas in `rethrowPragmas`
 * (default `invariant`, `assert`) the plugin emits `rethrow: true` and the
 * reporter re-throws after capturing — you gain the readable, grouped Sentry
 * event *and* keep the original control flow. `warning`/`console.assert` never
 * threw, so they stay report-only.
 *
 * ## Avoiding false positives (`requireResolvedImport`)
 *
 * Pragmas are matched by name only, so a function coincidentally named `assert`
 * or `warning` with unrelated semantics would be miscompiled. To guard against
 * this the plugin can require the callee to resolve to an `import`/`require` of a
 * known assertion module (`assertionModules`). This is **on by default for
 * `node_modules`** (where names collide across unknown packages) and **off for
 * first-party code** (where you control the names). `console.assert` and other
 * member pragmas are always allowed — `console` is a global.
 *
 * ## Runtime values
 *
 * `values` carries the live values of the identifiers in the condition so the
 * issue explains *why* it failed; it is only evaluated when the condition is
 * falsy (the right-hand side of `||`).
 *
 * ## Stack anchoring
 *
 * The `Error` is constructed at the call site (rather than inside the reporter)
 * so its stack top is the assertion site itself — in dev and release alike —
 * without depending on `error.framesToPop` (a dev-only debug-symbolicator knob)
 * or the `in_app` path heuristic. The reporter backfills a readable message.
 *
 * ## Injection & scope
 *
 * The helper binding is injected once per file with a collision-free local name.
 * It is a CommonJS `require` rather than an ESM `import` on purpose: with
 * `includeNodeModules` the plugin runs over dependency files that may be plain
 * CommonJS, and Metro's ESM→CJS transform bails on those before it would see an
 * injected `import`, leaving a bare `import` that Hermes rejects at release-build
 * time. A `require` binding works uniformly in both module kinds and is picked up
 * by Metro's dependency collection. The transform is idempotent: the rewritten
 * call's callee is the generated helper name, which never matches a pragma.
 *
 * Files inside `node_modules` are skipped unless `includeNodeModules` is set —
 * either `true` (all dependencies) or an array of path substrings (an allowlist,
 * so only the packages you name are instrumented). The Sentry SDK's own modules
 * are always skipped, since instrumenting them would inject a self-referential
 * `require('@sentry/react-native')` into the package that provides the reporter.
 */

const SENTRY_PACKAGE = '@sentry/react-native';
/**
 * The exported runtime reporter this plugin injects a call to. MUST stay in
 * sync with the actual `@sentry/react-native` export name — the plugin emits
 * `require('@sentry/react-native').<CAPTURE_FN>`, so a rename on one side
 * without the other breaks at runtime with an undefined helper. A test asserts
 * the two match (see `sentryAssertionBabelPlugin.test.ts`).
 */
export const CAPTURE_FN = 'captureAssertionViolation';
/** Per-file state key holding the injected helper's local identifier. */
const IMPORT_UID_KEY = 'sentryAssertionCaptureUid';
/** Per-file state key for the hoisted `Error`-constructor alias. */
const ERROR_UID_KEY = 'sentryAssertionErrorUid';

const DEFAULT_PRAGMAS = ['invariant', 'assert', 'warning', 'console.assert'];

/**
 * Pragmas that throw on a falsy condition. For these the reporter re-throws
 * after capturing so the original precondition semantics are preserved.
 */
const DEFAULT_RETHROW_PRAGMAS = ['invariant', 'assert'];

/**
 * Module specifiers a bare pragma identifier must resolve to when import
 * resolution is required (see `requireResolvedImport`). Matched exactly or by
 * trailing path segment, so `fbjs/lib/invariant` matches `invariant`.
 */
const DEFAULT_ASSERTION_MODULES = ['invariant', 'tiny-invariant', 'warning', 'assert', 'node:assert'];

/**
 * Path fragments identifying the Sentry SDK's own source. Files matching any of
 * these are never instrumented — the plugin injects a `require` of the SDK, so
 * rewriting the SDK's own asserts would create a self-referential require. The
 * second marker covers the monorepo dev symlink, whose path has no
 * `node_modules/@sentry` segment.
 */
const SENTRY_SDK_PATH_MARKERS = ['/@sentry/', 'sentry-react-native/packages/'];

export interface SentryAssertionBabelPluginOptions {
  /**
   * The assertion pragmas to rewrite. Simple identifiers (`invariant`) match a
   * bare call; a dotted name (`console.assert`) matches a member call on that
   * object. All configured pragmas are treated as "fire when the first argument
   * is falsy".
   *
   * @default ['invariant', 'assert', 'warning', 'console.assert']
   */
  pragmas?: string[];
  /**
   * Pragmas whose original semantics is to throw on a falsy condition. For a
   * match on one of these, the reporter re-throws after capturing so control
   * flow is preserved (a violated `invariant` still stops execution). Pragmas
   * not listed here are report-only.
   *
   * @default ['invariant', 'assert']
   */
  rethrowPragmas?: string[];
  /**
   * Also rewrite assertion call sites inside `node_modules`. Pass `true` to
   * instrument all dependencies, or an array of path substrings to allowlist
   * only specific packages (e.g. `['react-native/Libraries/Utilities']`). Off by
   * default so only first-party code is instrumented.
   *
   * @default false
   */
  includeNodeModules?: boolean | string[];
  /**
   * Only rewrite a bare-identifier pragma when its callee resolves to an
   * `import`/`require` of a module in `assertionModules`. Guards against
   * miscompiling a coincidentally-named local function. Defaults to `true` for
   * files under `node_modules` (unknown packages, colliding names) and `false`
   * for first-party code. Member pragmas like `console.assert` are unaffected.
   */
  requireResolvedImport?: boolean;
  /**
   * Module specifiers a bare pragma must resolve to when `requireResolvedImport`
   * is in effect.
   *
   * @default ['invariant', 'tiny-invariant', 'warning', 'assert', 'node:assert']
   */
  assertionModules?: string[];
}

interface BabelApi {
  types: typeof BabelTypes;
}

/**
 * Returns the pragma string matched by `callee`, or `undefined`. Supports bare
 * identifiers (`invariant`) and single-level member expressions (`console.assert`).
 *
 * Matching is purely syntactic on the callee shape — it does not follow aliases,
 * which has two consequences:
 *
 * - A renamed pragma slips through unmatched: `const inv = invariant; inv(x)` is
 *   left untouched because the callee is a bare `inv`, not `invariant`. Harmless
 *   (the site is simply not instrumented).
 * - A pragma destructured off its object is matched as the *bare* pragma, not the
 *   member one: `const { assert } = console; assert(false)` compiles under the
 *   `assert` pragma (a throwing precondition), not `console.assert` (report-only).
 *   Because the two default pragmas differ in `rethrow`, this flips a report-only
 *   `console.assert` into a throwing assertion. Following the binding back to
 *   `console` would require flow analysis and still risks miscompiling an
 *   unrelated same-named local, so it is left syntactic by design.
 *
 * Call the pragma by its canonical form (`console.assert(...)`, `invariant(...)`)
 * at the site you want instrumented; if you must destructure `console.assert`,
 * drop `assert` from `pragmas` (or drop it from `rethrowPragmas`) to avoid the
 * throwing rewrite.
 */
function matchPragma(
  t: typeof BabelTypes,
  callee: BabelTypes.Expression | BabelTypes.V8IntrinsicIdentifier,
  pragmas: string[],
): string | undefined {
  if (t.isIdentifier(callee)) {
    return pragmas.includes(callee.name) ? callee.name : undefined;
  }
  if (
    t.isMemberExpression(callee) &&
    !callee.computed &&
    t.isIdentifier(callee.object) &&
    t.isIdentifier(callee.property)
  ) {
    const dotted = `${callee.object.name}.${callee.property.name}`;
    return pragmas.includes(dotted) ? dotted : undefined;
  }
  return undefined;
}

/**
 * Normalizes path separators to forward slashes so substring matching works on
 * Windows, where Babel/Metro `filename` values contain backslashes.
 */
function toPosixPath(filename: string): string {
  return filename.replace(/\\/g, '/');
}

/**
 * True when `filename` belongs to the Sentry SDK's own source. Separators are
 * normalized first: the markers use forward slashes, so without this an SDK path
 * with Windows backslashes would slip through and get a self-referential
 * `require('@sentry/react-native')` injected into the package that defines it.
 */
function isSentrySdkPath(filename: string): boolean {
  const normalized = toPosixPath(filename);
  return SENTRY_SDK_PATH_MARKERS.some(marker => normalized.includes(marker));
}

/** True when `source` matches one of `modules` exactly or by trailing segment. */
function moduleMatches(source: string, modules: string[]): boolean {
  return modules.some(m => source === m || source.endsWith(`/${m}`));
}

/**
 * True when the bare-identifier callee at `calleePath` resolves to an
 * `import`/`require` of a module in `modules`. Handles `import invariant from
 * 'invariant'`, named imports, and `const invariant = require('invariant')`.
 */
function calleeResolvesToAssertionModule(
  t: typeof BabelTypes,
  calleePath: NodePath<BabelTypes.Node>,
  modules: string[],
): boolean {
  if (!calleePath.isIdentifier()) {
    return false;
  }
  const binding = calleePath.scope.getBinding(calleePath.node.name);
  if (!binding) {
    return false;
  }
  const decl = binding.path;
  if (decl.isImportDefaultSpecifier() || decl.isImportSpecifier() || decl.isImportNamespaceSpecifier()) {
    const source = decl.parentPath?.isImportDeclaration() ? decl.parentPath.node.source.value : undefined;
    return typeof source === 'string' && moduleMatches(source, modules);
  }
  if (decl.isVariableDeclarator()) {
    const init = decl.node.init;
    if (
      init &&
      t.isCallExpression(init) &&
      t.isIdentifier(init.callee, { name: 'require' }) &&
      init.arguments.length > 0 &&
      t.isStringLiteral(init.arguments[0])
    ) {
      return moduleMatches(init.arguments[0].value, modules);
    }
  }
  return false;
}

/**
 * Returns the original source text spanned by `node`, or `undefined` when
 * location info is unavailable.
 */
function sourceOf(state: PluginPass, node: BabelTypes.Node): string | undefined {
  const code = state.file?.code;
  if (typeof code === 'string' && typeof node.start === 'number' && typeof node.end === 'number') {
    return code.slice(node.start, node.end);
  }
  return undefined;
}

/**
 * Collects the distinct identifier names referenced in the assertion condition
 * that resolve to a binding in scope (locals, params, imports) — the runtime
 * values worth attaching to explain *why* the assertion failed.
 *
 * Only bare identifier references are collected, never sub-expressions: reading
 * a variable does not run a call or trip a getter, so re-referencing these on
 * the (falsy) report path can't cause a double-evaluation side effect. A call
 * like `isReady()` therefore contributes only its callee name `isReady` (the
 * function value), never an invocation. Unbound globals (`undefined`, `Math`,
 * `console`, …) are skipped as noise, and member *properties* (`a.ready` →
 * `ready`) are excluded because they sit in a non-referenced position.
 *
 * Identifiers bound *inside* the condition are excluded: the emitted `values`
 * object is evaluated at the call site, so a name bound in a nested scope — e.g.
 * the `x` parameter in `invariant(items.every(x => x > 0))` — is out of scope
 * there and would throw a `ReferenceError` on the (falsy) report path. Only
 * identifiers whose binding is visible from the call-site scope are collected;
 * `items` is captured, `x` is not.
 *
 * A `let`/`const` binding declared textually *after* the call site is dropped:
 * on the falsy report path the emitted `values` reads it, and if the original
 * condition only reached it via short-circuit the read would hit its temporal
 * dead zone here — a `ReferenceError` the original never threw. (A deferred
 * call could initialize it before running, so this may drop a safe value, but
 * dropping a value is always preferable to crashing the report path.)
 */
function collectValueIdentifiers(conditionPath: NodePath<BabelTypes.Expression>): string[] {
  const names = new Set<string>();
  // The `values` object is emitted in the call-site scope, so only capture
  // identifiers that resolve to a binding visible there. An identifier bound in
  // a nested scope (an arrow param, a callback local) resolves to a different
  // binding than the call-site scope sees — or to none — so it is dropped.
  const callSiteScope = conditionPath.scope;
  // The `values` object is emitted at the call site's position; a lexical
  // binding whose declaration starts after this is in its TDZ here.
  const useStart = conditionPath.node.start;
  const add = (p: NodePath<BabelTypes.Node>): void => {
    if (!p.isIdentifier() || !p.isReferencedIdentifier()) {
      return;
    }
    const name = p.node.name;
    const binding = p.scope.getBinding(name);
    if (!binding || callSiteScope.getBinding(name) !== binding) {
      return;
    }
    if (binding.kind === 'let' || binding.kind === 'const') {
      // Class declarations also register as `let`, so this covers them too.
      const declStart = binding.path.node.start;
      if (typeof declStart === 'number' && typeof useStart === 'number' && declStart > useStart) {
        return;
      }
    }
    names.add(name);
  };
  // `traverse` visits descendants only, so check the root expression too (a bare
  // `invariant(ready)` condition is the identifier itself).
  add(conditionPath);
  conditionPath.traverse({
    Identifier(p) {
      add(p);
    },
  });
  return Array.from(names);
}

/** True when `filename` should be skipped given the `includeNodeModules` option. */
function isNodeModulesExcluded(filename: string, includeNodeModules: boolean | string[] | undefined): boolean {
  if (!filename.includes('node_modules')) {
    return false;
  }
  if (!includeNodeModules) {
    return true;
  }
  if (Array.isArray(includeNodeModules)) {
    // Allowlist fragments are written with forward slashes; normalize so they
    // still match on Windows (backslash) paths.
    const normalized = toPosixPath(filename);
    return !includeNodeModules.some(fragment => normalized.includes(fragment));
  }
  return false;
}

/**
 * Decides whether `path` is an assertion call this plugin should rewrite in the
 * file `filename`, and if so returns the matched pragma and its condition
 * argument. Returns `undefined` for every skip reason (SDK self-exclusion,
 * `node_modules` exclusion, non-pragma callee, missing/spread condition, or a
 * bare pragma that does not resolve to a known assertion module when required).
 */
function resolveInstrumentablePragma(
  t: typeof BabelTypes,
  path: NodePath<BabelTypes.CallExpression>,
  filename: string,
  options: SentryAssertionBabelPluginOptions,
): { pragma: string; condition: BabelTypes.Expression } | undefined {
  // Never instrument the Sentry SDK itself — the plugin injects a require of the
  // SDK, so rewriting its own asserts would create a circular require.
  if (isSentrySdkPath(filename)) {
    return undefined;
  }
  if (isNodeModulesExcluded(filename, options.includeNodeModules)) {
    return undefined;
  }

  const pragma = matchPragma(t, path.node.callee, options.pragmas ?? DEFAULT_PRAGMAS);
  if (pragma === undefined) {
    return undefined;
  }

  const condition = path.node.arguments[0];
  if (condition === undefined || !t.isExpression(condition)) {
    // Nothing to guard on (no args, or a spread) — leave the call as-is.
    return undefined;
  }

  // Guard against miscompiling a coincidentally-named function: for a bare
  // identifier pragma, optionally require it to resolve to a known assertion
  // module. On by default in node_modules, off for first-party code.
  const requireResolved = options.requireResolvedImport ?? filename.includes('node_modules');
  if (requireResolved && t.isIdentifier(path.node.callee)) {
    const modules = options.assertionModules ?? DEFAULT_ASSERTION_MODULES;
    if (!calleeResolvesToAssertionModule(t, path.get('callee'), modules)) {
      return undefined;
    }
  }

  return { pragma, condition };
}

/**
 * Resolves the helper's local binding for this file, injecting it once at the
 * top of the program on first use. A `require` binding (not an ESM `import`) so
 * it survives in plain CommonJS dependency files under `includeNodeModules` —
 * see the module doc comment above.
 */
function ensureHelperBinding(
  t: typeof BabelTypes,
  path: NodePath<BabelTypes.CallExpression>,
  state: PluginPass,
): BabelTypes.Identifier {
  let uid = state.get(IMPORT_UID_KEY) as BabelTypes.Identifier | undefined;
  if (uid) {
    return uid;
  }
  uid = path.scope.generateUidIdentifier(CAPTURE_FN);
  const program = path.scope.getProgramParent().path as NodePath<BabelTypes.Program>;
  program.unshiftContainer('body', [
    t.variableDeclaration('var', [
      t.variableDeclarator(
        t.cloneNode(uid),
        t.memberExpression(
          t.callExpression(t.identifier('require'), [t.stringLiteral(SENTRY_PACKAGE)]),
          t.identifier(CAPTURE_FN),
        ),
      ),
    ]),
  ]);
  state.set(IMPORT_UID_KEY, uid);
  return uid;
}

/**
 * Resolves a hoisted alias of the global `Error` constructor for this file,
 * injecting `var _Error = Error;` once at the top of the program on first use.
 *
 * The transform emits `new Error()` at the assertion call site (so the stack top
 * is the site itself). Referencing `Error` directly there would bind to whatever
 * `Error` is in scope — a local `let Error`, a parameter, an import — and a
 * non-constructable shadow would throw `TypeError: Error is not a constructor`
 * exactly when the assertion fires. The alias is captured at program top, where
 * `Error` is the global, so the injected `new _Error()` is immune to call-site
 * shadowing.
 */
function ensureErrorBinding(
  t: typeof BabelTypes,
  path: NodePath<BabelTypes.CallExpression>,
  state: PluginPass,
): BabelTypes.Identifier {
  let uid = state.get(ERROR_UID_KEY) as BabelTypes.Identifier | undefined;
  if (uid) {
    return uid;
  }
  uid = path.scope.generateUidIdentifier('Error');
  const program = path.scope.getProgramParent().path as NodePath<BabelTypes.Program>;
  program.unshiftContainer('body', [
    t.variableDeclaration('var', [t.variableDeclarator(t.cloneNode(uid), t.identifier('Error'))]),
  ]);
  state.set(ERROR_UID_KEY, uid);
  return uid;
}

/** Builds the reporter's options-object properties for a matched call site. */
function buildReportProperties(
  t: typeof BabelTypes,
  path: NodePath<BabelTypes.CallExpression>,
  state: PluginPass,
  filename: string,
  pragma: string,
  condition: BabelTypes.Expression,
  options: SentryAssertionBabelPluginOptions,
): BabelTypes.ObjectProperty[] {
  const properties: BabelTypes.ObjectProperty[] = [t.objectProperty(t.identifier('pragma'), t.stringLiteral(pragma))];

  const conditionSource = sourceOf(state, condition);
  if (conditionSource !== undefined) {
    properties.push(t.objectProperty(t.identifier('condition'), t.stringLiteral(conditionSource)));
  }

  // Attach the runtime values of the identifiers in the condition so the issue
  // shows *why* it failed (e.g. `count > 0` → `{ count: 0 }`). Only evaluated on
  // the report path (RHS of `cond || …`), so it costs nothing when the assertion
  // holds — see `collectValueIdentifiers` for the side-effect analysis.
  const conditionPath = path.get('arguments.0') as NodePath<BabelTypes.Expression>;
  const valueNames = collectValueIdentifiers(conditionPath);
  if (valueNames.length > 0) {
    properties.push(
      t.objectProperty(
        t.identifier('values'),
        t.objectExpression(valueNames.map(name => t.objectProperty(t.identifier(name), t.identifier(name)))),
      ),
    );
  }

  const messageArg = path.node.arguments[1];
  if (messageArg !== undefined && t.isExpression(messageArg)) {
    properties.push(t.objectProperty(t.identifier('message'), t.cloneNode(messageArg, true)));

    // Forward the variadic substitution args (`invariant(cond, fmt, ...args)`,
    // `console.assert(cond, fmt, ...args)`) so the reporter interpolates the
    // `%s`/`%d`/... specifiers instead of surfacing the literal format string.
    // Cloned into an array literal on the report (RHS) path, so — like the
    // condition's `values` — they are only evaluated when the assertion fails.
    const extraArgs = path.node.arguments
      .slice(2)
      .filter((a): a is BabelTypes.Expression | BabelTypes.SpreadElement => t.isExpression(a) || t.isSpreadElement(a));
    if (extraArgs.length > 0) {
      properties.push(
        t.objectProperty(t.identifier('messageArgs'), t.arrayExpression(extraArgs.map(a => t.cloneNode(a, true)))),
      );
    }
  }

  const loc = path.node.loc;
  if (loc) {
    const basename = filename.split(/[\\/]/).pop() || filename;
    const siteId = `${basename}:${loc.start.line}:${loc.start.column}`;
    properties.push(t.objectProperty(t.identifier('siteId'), t.stringLiteral(siteId)));
  }

  // For a throwing pragma (`invariant`/`assert`), preserve control flow: the
  // reporter re-throws after capturing so downstream code that assumed the
  // precondition held is not reached with invalid state.
  const rethrowPragmas = options.rethrowPragmas ?? DEFAULT_RETHROW_PRAGMAS;
  if (rethrowPragmas.includes(pragma)) {
    properties.push(t.objectProperty(t.identifier('rethrow'), t.booleanLiteral(true)));
  }

  // Construct the `Error` at the call site so its stack top is the assertion
  // site itself — in dev AND release, with no reliance on `error.framesToPop`
  // (consumed only by the dev debug symbolicator) or the `in_app` path
  // heuristic. The reporter backfills a readable `.message`, so it is bare here.
  // Use the hoisted global-`Error` alias so a call-site shadow can't turn this
  // into a `TypeError` when the assertion fires — see `ensureErrorBinding`.
  const errorUid = ensureErrorBinding(t, path, state);
  properties.push(t.objectProperty(t.identifier('error'), t.newExpression(t.cloneNode(errorUid), [])));

  return properties;
}

export default function sentryAssertionBabelPlugin({ types: t }: BabelApi): PluginObj<PluginPass> {
  return {
    name: 'sentry-assertion',
    visitor: {
      CallExpression(path: NodePath<BabelTypes.CallExpression>, state: PluginPass) {
        const options = (state.opts as SentryAssertionBabelPluginOptions | undefined) ?? {};
        const filename = (state.file?.opts?.filename as string | undefined) ?? '';

        // Only rewrite a standalone assertion statement. As a subexpression
        // (`warning(cond) && next()`), the `cond || report()` rewrite would
        // change the value and branching — `report()` returns a truthy event id
        // where the pragma returned `undefined` — so those calls are left alone.
        if (!path.parentPath.isExpressionStatement()) {
          return;
        }

        const match = resolveInstrumentablePragma(t, path, filename, options);
        if (!match) {
          return;
        }
        const { pragma, condition } = match;

        const uid = ensureHelperBinding(t, path, state);
        const properties = buildReportProperties(t, path, state, filename, pragma, condition, options);
        const reportCall = t.callExpression(t.cloneNode(uid), [t.objectExpression(properties)]);

        // `cond || report()` — truthy condition short-circuits and never reports;
        // a falsy condition reports (and, for throwing pragmas, re-throws).
        path.replaceWith(t.logicalExpression('||', t.cloneNode(condition, true), reportCall));
      },
    },
  };
}
