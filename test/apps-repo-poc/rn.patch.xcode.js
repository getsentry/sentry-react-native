#!/usr/bin/env node
/* eslint-disable no-useless-escape */

const fs = require('fs');
const { argv } = require('process');

const xcode = require('xcode');
const parseArgs = require('minimist');
const { logger } = require('@sentry/utils');
logger.enable();

const args = parseArgs(argv.slice(2));
if (!args.project) {
  throw new Error('Missing --project');
}
if (!args['rn-version']) {
  throw new Error('Missing --rn-version');
}

let bundleScript;
let bundleScriptRegex;
let bundlePatchRegex;
const symbolsScript = `
export SENTRY_PROPERTIES=sentry.properties
../node_modules/@sentry/cli/bin/sentry-cli upload-dsym
`;
const symbolsPatchRegex = /sentry-cli\s+(upload-dsym|debug-files upload)/;
if (args['rn-version'] === '<0.69') {
  bundleScript = `
export SENTRY_PROPERTIES=sentry.properties
export EXTRA_PACKAGER_ARGS="--sourcemap-output $DERIVED_FILE_DIR/main.jsbundle.map"
set -e

export NODE_BINARY=node
../node_modules/@sentry/cli/bin/sentry-cli react-native xcode ../node_modules/react-native/scripts/react-native-xcode.sh

/bin/sh ../node_modules/@sentry/react-native/scripts/collect-modules.sh
`;
  bundleScriptRegex = /(packager|scripts)\/react-native-xcode\.sh\b/;
  bundlePatchRegex = /sentry-cli\s+react-native[\s-]xcode/;


} else if (args['rn-version'] === '>=0.69') {
  bundleScript = `
export SENTRY_PROPERTIES=sentry.properties
export EXTRA_PACKAGER_ARGS="--sourcemap-output $DERIVED_FILE_DIR/main.jsbundle.map"
set -e

WITH_ENVIRONMENT="../node_modules/react-native/scripts/xcode/with-environment.sh"
REACT_NATIVE_XCODE="../node_modules/react-native/scripts/react-native-xcode.sh"

/bin/sh -c "$WITH_ENVIRONMENT \"../node_modules/@sentry/cli/bin/sentry-cli react-native xcode $REACT_NATIVE_XCODE\""

/bin/sh ../node_modules/@sentry/react-native/scripts/collect-modules.sh
`;
  bundleScriptRegex = /\/scripts\/react-native-xcode\.sh/i;
  bundlePatchRegex = /sentry-cli\s+react-native\s+xcode/i;
} else {
  throw new Error('Unknown RN version');
}

const project = xcode.project(args.project);

project.parseSync();

const buildPhasesRaw = project.hash.project.objects.PBXShellScriptBuildPhase;
const buildPhases = [];
for (const key in buildPhasesRaw) {
  if (buildPhasesRaw[key].isa) {
    buildPhases.push(buildPhasesRaw[key]);
  }
}

buildPhases.forEach((phase) => {
  const isBundleReactNative = phase.shellScript.match(bundleScriptRegex);
  const isPatched = phase.shellScript.match(bundlePatchRegex);
  if (!isBundleReactNative) {
    return;
  }
  if (isPatched) {
    logger.warn('Xcode project Bundle RN Build phase already patched');
    return;
  }
  phase.shellScript = JSON.stringify(bundleScript);
  logger.info('Patched Xcode project Bundle RN Build phase');
});

const isSymbolsPhase = (phase) => phase.shellScript.match(symbolsPatchRegex);
const areSymbolsPatched = buildPhases.some(isSymbolsPhase);

if (!areSymbolsPatched) {
  project.addBuildPhase(
    [],
    'PBXShellScriptBuildPhase',
    'Upload Debug Symbols to Sentry',
    null,
    {
      shellPath: '/bin/sh',
      shellScript: symbolsScript,
    },
  );
  logger.info('Added Xcode project Upload Debug Symbols Build phase');
} else {
  logger.warn('Xcode project Upload Debug Symbols Build phase already patched');
}

fs.writeFileSync(args.project, project.writeSync());
logger.info('Patched Xcode project successfully!');
