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

const buildGradlePath = path.join(
  args['app-dir'],
  'node_modules',
  'react-native-launch-arguments',
  'android',
  'build.gradle'
);

debug.log('Patching react-native-launch-arguments build.gradle', buildGradlePath);

if (!fs.existsSync(buildGradlePath)) {
  debug.log('build.gradle not found, skipping patch');
  return;
}

const buildGradle = fs.readFileSync(buildGradlePath, 'utf8');

// Replace destinationDir with destinationDirectory.get() for Gradle 9+ compatibility
const isPatched = buildGradle.includes('destinationDirectory.get()');
if (!isPatched) {
  const patched = buildGradle.replace(
    /\.destinationDir\b/g,
    '.destinationDirectory.get()'
  );

  fs.writeFileSync(buildGradlePath, patched);
  debug.log('Patched react-native-launch-arguments build.gradle successfully!');
} else {
  debug.log('react-native-launch-arguments build.gradle is already patched!');
}

