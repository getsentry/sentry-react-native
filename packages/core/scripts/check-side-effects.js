const fs = require('fs');
const path = require('path');
const ts = require('typescript');

// Guards the `"sideEffects": false` contract in package.json: no module that ships
// in the bundle may run code at import time. A bundler is free to drop such a module
// when its exports are unused, so an import-time side effect would silently vanish
// from a consumer's build. This fails if one is introduced.
//
// Flagged, at module top level only:
//   - bare side-effect imports:  import './x'  /  import 'pkg'
//   - executed statements run for effect: calls, assignments, IIFEs, global writes
// Declarations are fine, including `const x = f()`: they are module-local and ride
// with the module only when it is kept. `tools/` is excluded (Node-only build tools,
// never bundled into an app).

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src', 'js');
const EXCLUDE_DIRS = [path.join(SRC, 'tools')];

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
    if (ts.isImportDeclaration(stmt) && !stmt.importClause) {
      findings.push({ file, line: lineOf(), kind: 'bare side-effect import', code: stmt.getText(sourceFile) });
    } else if (ts.isExpressionStatement(stmt)) {
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
console.log('✓ no import-time side effects in src/js (tools/ excluded) — "sideEffects": false is safe');
