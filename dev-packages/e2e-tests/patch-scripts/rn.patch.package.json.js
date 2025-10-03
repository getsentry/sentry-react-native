#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { argv, cwd } = require('process');
const parseArgs = require('minimist');
const { debug } = require('@sentry/core');
debug.enable();

const args = parseArgs(argv.slice(2), { string: ['app','path','file'], alias: { path: ['file'] } });

function resolvePkgPath() {
  if (args.path) {
    const p = path.resolve(args.path);
    if (!p.endsWith('package.json')) throw new Error(`--path must point to package.json, got: ${p}`);
    return p;
  }
  if (args.app) return path.join(path.resolve(args.app), 'package.json');
  return path.join(cwd(), 'package.json');
}

const pkgPath = resolvePkgPath();
if (!fs.existsSync(pkgPath)) throw new Error(`package.json not found at: ${pkgPath}`);

const raw = fs.readFileSync(pkgPath, 'utf8');
let pkg;
try { pkg = JSON.parse(raw); } catch (e) { throw new Error(`Invalid JSON: ${e.message}`); }

const METRO_VERSION = '0.83.2';

// List of Metro packages that need to be pinned
const METRO_PACKAGES = [
  'metro',
  'metro-config'
];

pkg.overrides = pkg.overrides || {};
METRO_PACKAGES.forEach(pkgName => {
  pkg.overrides[pkgName] = METRO_VERSION;
});

pkg.resolutions = pkg.resolutions || {};
METRO_PACKAGES.forEach(pkgName => {
  pkg.resolutions[pkgName] = METRO_VERSION;
});

fs.writeFileSync(pkgPath + '.bak', raw);
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

debug.log('Patched package.json: Metro packages set to', METRO_VERSION);
