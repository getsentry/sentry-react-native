const fs = require('fs');
const path = require('path');
const ts = require('typescript');

// Guards the `"sideEffects": false` contract in package.json: no module that ships
// in the bundle may run code at import time. A bundler is free to drop such a module
// when its exports are unused, so an import-time side effect would silently vanish
// from a consumer's build. This fails if one is introduced.
//
// Allowlist approach: only pure declarations are permitted at module top level;
// every other statement is flagged, since anything else can execute at import time
// (an `if`/`for`/`try`/block wrapping a call, a bare expression, an IIFE, a global
// write). A side-effect import (`import 'x'` or `import {} from 'x'`, i.e. one that
// binds nothing) is flagged too. Declarations are fine, including `const x = f()`:
// they are module-local and ride with the module only when it is kept.
//
// Excluded: `tools/` (Node-only build tools, never bundled into an app) and `vendor/`
// (audited third-party code reviewed when it is vendored in). The guard's job is to
// stop first-party SDK code from gaining an import-time side effect.

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src', 'js');
const EXCLUDE_DIRS = [path.join(SRC, 'tools'), path.join(SRC, 'vendor')];

// Top-level statement kinds that are pure declarations (no import-time execution).
const ALLOWED_KINDS = new Set([
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.ClassDeclaration,
  ts.SyntaxKind.InterfaceDeclaration,
  ts.SyntaxKind.TypeAliasDeclaration,
  ts.SyntaxKind.EnumDeclaration,
  ts.SyntaxKind.ModuleDeclaration, // namespace / declare module
  ts.SyntaxKind.VariableStatement, // const/let/var — incl. `const x = f()`
  ts.SyntaxKind.ExportDeclaration, // export { ... } / export * from
  ts.SyntaxKind.ExportAssignment, // export default ... / export =
  ts.SyntaxKind.ImportEqualsDeclaration,
  ts.SyntaxKind.EmptyStatement,
]);

// An import binds nothing (pure side-effect import) when it has no clause, or a clause
// with neither a default name nor namespace nor any named binding. Type-only imports
// are erased at compile time, so they never run.
function isSideEffectImport(node) {
  const clause = node.importClause;
  if (clause && clause.isTypeOnly) {
    return false;
  }
  if (!clause) {
    return true;
  }
  if (clause.name) {
    return false;
  }
  const bindings = clause.namedBindings;
  if (!bindings) {
    return true;
  }
  return ts.isNamedImports(bindings) && bindings.elements.length === 0;
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.some(d => p === d || p.startsWith(d + path.sep))) {
        continue;
      }
      walk(p, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

const findings = [];
for (const file of walk(SRC, [])) {
  const text = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.ES2018, true, ts.ScriptKind.TSX);
  for (const stmt of sourceFile.statements) {
    const lineOf = () => sourceFile.getLineAndCharacterOfPosition(stmt.getStart(sourceFile)).line + 1;
    if (ts.isImportDeclaration(stmt)) {
      if (isSideEffectImport(stmt)) {
        findings.push({ file, line: lineOf(), kind: 'side-effect import', code: stmt.getText(sourceFile) });
      }
    } else if (!ALLOWED_KINDS.has(stmt.kind)) {
      findings.push({ file, line: lineOf(), kind: 'top-level executed statement', code: stmt.getText(sourceFile).slice(0, 100) });
    }
  }
}

const rel = f => path.relative(ROOT, f);
if (findings.length) {
  console.error(`\n✖ import-time side effects found (${findings.length}) — these break the "sideEffects": false contract:\n`);
  for (const f of findings) {
    console.error(`  ${rel(f.file)}:${f.line}  [${f.kind}]  ${f.code.replace(/\n/g, ' ')}`);
  }
  console.error('\nMove the side effect into a function called by init()/wrap()/an integration factory.\n');
  process.exit(1);
}
console.log('✓ no import-time side effects in src/js (tools/, vendor/ excluded) — "sideEffects": false is safe');
