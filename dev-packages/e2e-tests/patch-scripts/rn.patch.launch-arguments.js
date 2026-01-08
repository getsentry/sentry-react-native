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
} else {
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
}

// Patch iOS podspec for React Native 0.71+ compatibility
// Replace 'React' with 'React-Core' to fix RCTRegisterModule undefined symbol error in RN 0.84+ with dynamic frameworks
const podspecPath = path.join(
  args['app-dir'],
  'node_modules',
  'react-native-launch-arguments',
  'react-native-launch-arguments.podspec'
);

debug.log('Patching react-native-launch-arguments podspec', podspecPath);

if (fs.existsSync(podspecPath)) {
  const podspec = fs.readFileSync(podspecPath, 'utf8');
  const isPatched = podspec.includes("s.dependency 'React-Core'") || podspec.includes('s.dependency "React-Core"');
  if (!isPatched) {
    const patched = podspec
      .replace(/s\.dependency\s+['"]React['"]/g, "s.dependency 'React-Core'")
      .replace(/s\.dependency\s+['"]React\/Core['"]/g, "s.dependency 'React-Core'");

    fs.writeFileSync(podspecPath, patched);
    debug.log('Patched react-native-launch-arguments podspec successfully!');
  } else {
    debug.log('react-native-launch-arguments podspec is already patched!');
  }
} else {
  debug.log('podspec not found, skipping iOS patch');
}

