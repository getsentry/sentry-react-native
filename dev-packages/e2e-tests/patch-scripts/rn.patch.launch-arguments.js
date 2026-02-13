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
// Replace 'React' with install_modules_dependencies() to fix RCTRegisterModule undefined symbol error in RN 0.84+ with dynamic frameworks
const podspecPath = path.join(
  args['app-dir'],
  'node_modules',
  'react-native-launch-arguments',
  'react-native-launch-arguments.podspec'
);

debug.log('Patching react-native-launch-arguments podspec', podspecPath);

if (fs.existsSync(podspecPath)) {
  const podspec = fs.readFileSync(podspecPath, 'utf8');
  debug.log('Found podspec, checking for React dependency...');

  // Check if already patched with install_modules_dependencies
  const isPatched = podspec.includes('install_modules_dependencies');
  const hasReactDep = /s\.dependency\s+['"]React['"]/.test(podspec);
  const hasReactCoreDep = /s\.dependency\s+['"]React\/Core['"]/.test(podspec);
  const hasReactCoreDepOnly = podspec.includes("s.dependency 'React-Core'") || podspec.includes('s.dependency "React-Core"');

  debug.log(`Podspec status: isPatched=${isPatched}, hasReactDep=${hasReactDep}, hasReactCoreDep=${hasReactCoreDep}, hasReactCoreDepOnly=${hasReactCoreDepOnly}`);

  if (!isPatched && (hasReactDep || hasReactCoreDep || hasReactCoreDepOnly)) {
    let patched = podspec;

    // Replace any React dependency with install_modules_dependencies(s)
    // This is the modern approach that works with all framework configurations (static, dynamic, etc.)
    // and automatically includes the correct React Native dependencies
    const installModulesDepsBlock = `
  if defined? install_modules_dependencies
    install_modules_dependencies(s)
  else
    s.dependency "React-Core"
  end`;

    if (hasReactDep) {
      debug.log("Replacing s.dependency 'React' with install_modules_dependencies(s)");
      patched = patched.replace(/\s+s\.dependency\s+['"]React['"]\s*\n/g, installModulesDepsBlock + '\n');
    } else if (hasReactCoreDep) {
      debug.log("Replacing s.dependency 'React/Core' with install_modules_dependencies(s)");
      patched = patched.replace(/\s+s\.dependency\s+['"]React\/Core['"]\s*\n/g, installModulesDepsBlock + '\n');
    } else if (hasReactCoreDepOnly) {
      debug.log("Replacing s.dependency 'React-Core' with install_modules_dependencies(s)");
      patched = patched.replace(/\s+s\.dependency\s+['"]React-Core['"]\s*\n/g, installModulesDepsBlock + '\n');
    }

    fs.writeFileSync(podspecPath, patched);
    debug.log('Patched react-native-launch-arguments podspec successfully!');
  } else if (isPatched) {
    debug.log('react-native-launch-arguments podspec is already patched!');
  } else {
    debug.log('Podspec does not contain React dependency - may already use install_modules_dependencies');
  }
} else {
  debug.log('podspec not found, skipping iOS patch');
}

