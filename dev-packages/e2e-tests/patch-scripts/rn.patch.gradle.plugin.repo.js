#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { argv } = require('process');

const parseArgs = require('minimist');
const { debug } = require('@sentry/core');
debug.enable();

const args = parseArgs(argv.slice(2));
if (!args['app-dir']) {
  throw new Error('Missing --app-dir');
}

// Sonatype's legacy OSSRH host (oss.sonatype.org) reached end-of-life on
// 2025-06-30 and is now unreliable — it intermittently answers with a
// `504 Gateway Time-out` instead of a clean `404`. The React Native Gradle
// plugin bundled with older RN versions (e.g. 0.71) hardcodes this host as a
// snapshots repository and injects it into every project's repository list.
// Gradle treats a 5xx from any declared repo as fatal (unlike a 404, which it
// skips), so a single 504 breaks resolution of ANY dependency (react-android,
// AGP lint, ...) even though those artifacts live on Maven Central / google().
// Swapping the dead host for its live replacement makes the repo return clean
// 404s for release artifacts, so Gradle skips it and resolves as intended.
const OLD_URL = 'https://oss.sonatype.org/content/repositories/snapshots/';
const NEW_URL = 'https://central.sonatype.com/repository/maven-snapshots/';

const dependencyUtilsPath = path.join(
  args['app-dir'],
  'node_modules',
  'react-native-gradle-plugin',
  'src',
  'main',
  'kotlin',
  'com',
  'facebook',
  'react',
  'utils',
  'DependencyUtils.kt'
);

debug.log('Patching React Native Gradle plugin snapshots repo', dependencyUtilsPath);

if (!fs.existsSync(dependencyUtilsPath)) {
  debug.log('DependencyUtils.kt not found, skipping patch (plugin likely already uses a live repo)');
} else {
  const source = fs.readFileSync(dependencyUtilsPath, 'utf8');

  if (!source.includes(OLD_URL)) {
    debug.log('DependencyUtils.kt does not reference the dead OSSRH host, nothing to patch');
  } else {
    const patched = source.split(OLD_URL).join(NEW_URL);
    fs.writeFileSync(dependencyUtilsPath, patched);
    debug.log('Patched React Native Gradle plugin snapshots repo successfully!');
  }
}
