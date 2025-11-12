#!/usr/bin/env node

const fs = require('fs');
const { argv } = require('process');

const parseArgs = require('minimist');
const { debug } = require('@sentry/core');
debug.enable();

const args = parseArgs(argv.slice(2));
if (!args['pod-file']) {
  throw new Error('Missing --pod-file');
}

if (!args['engine']) {
  throw new Error('Missing --engine');
}

const enableHermes = args['engine'] === 'hermes' ? true : args['engine'] === 'jsc' ? false : null;
if (enableHermes === null) {
  throw new Error('Invalid engine');
}

// Optional iOS version argument, defaults to '15.0' due to Cocoa SDK V9 requirement
const iosVersion = args['ios-version'] || '15.0';

debug.log('Patching Podfile', args['pod-file']);
let content = fs.readFileSync(args['pod-file'], 'utf8');

const isHermesEnabled = content.includes(':hermes_enabled => true,');
const shouldPatch = enableHermes !== isHermesEnabled;
if (shouldPatch) {
  content = content.replace(
    /:hermes_enabled.*/,
    enableHermes ? ':hermes_enabled => true,' : ':hermes_enabled => false,',
  );
  if (enableHermes) {
    debug.log('Patching Podfile for Hermes');
  } else {
    debug.log('Patching Podfile for JSC');
  }
}

// Patch iOS version
const platformPattern = /platform :ios, (min_ios_version_supported|['"][0-9.]+['"])/;
const currentMatch = content.match(platformPattern);

if (currentMatch) {
  const currentValue = currentMatch[1];
  const shouldPatchVersion = currentValue === 'min_ios_version_supported' ||
                             currentValue !== `'${iosVersion}'`;

  if (shouldPatchVersion) {
    content = content.replace(
      platformPattern,
      `platform :ios, '${iosVersion}'`
    );
    debug.log(`Patching iOS version to ${iosVersion} (was: ${currentValue})`);
  } else {
    debug.log(`iOS version already set to ${iosVersion}`);
  }
} else {
  debug.log('Warning: Could not find platform :ios line to patch');
}

// Write the file if any changes were made
if (shouldPatch || currentMatch) {
  fs.writeFileSync(args['pod-file'], content);
  debug.log('Podfile patched successfully!');
} else {
  debug.log('Podfile is already patched!');
}
