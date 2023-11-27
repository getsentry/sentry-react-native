#!/usr/bin/env node

const fs = require('fs');
const { argv } = require('process');

const xcode = require('xcode');
const parseArgs = require('minimist');
const semver = require('semver');
const { logger } = require('@sentry/utils');
logger.enable();

const args = parseArgs(argv.slice(2));
if (!args.project) {
  throw new Error('Missing --project');
}
if (!args['rn-version']) {
  throw new Error('Missing --rn-version');
}

logger.info('Patching Xcode project', args.project, 'for RN version', args['rn-version']);

const newBundleScriptRNVersion = '0.69.0-rc.0';

let bundleScript;
let bundleScriptRegex;
let bundlePatchRegex;
const symbolsScript = `
/bin/sh ../node_modules/@sentry/react-native/scripts/sentry-xcode-debug-files.sh
`;
const symbolsPatchRegex = /sentry-cli\s+(upload-dsym|debug-files upload)/;
if (semver.satisfies(args['rn-version'], `< ${newBundleScriptRNVersion}`)) {
  logger.info('Applying old bundle script patch');
  bundleScript = `
export NODE_BINARY=node
export SENTRY_CLI_EXTRA_ARGS="--force-foreground"
../node_modules/@sentry/react-native/scripts/sentry-xcode.sh ../node_modules/react-native/scripts/react-native-xcode.sh
`;
  bundleScriptRegex = /(packager|scripts)\/react-native-xcode\.sh\b/;
  bundlePatchRegex = /sentry-cli\s+react-native[\s-]xcode/;
} else if (semver.satisfies(args['rn-version'], `>= ${newBundleScriptRNVersion}`)) {
  logger.info('Applying new bundle script patch');
  bundleScript = `
export SENTRY_CLI_EXTRA_ARGS="--force-foreground"
WITH_ENVIRONMENT="../node_modules/react-native/scripts/xcode/with-environment.sh"
REACT_NATIVE_XCODE="../node_modules/react-native/scripts/react-native-xcode.sh"

/bin/sh -c "$WITH_ENVIRONMENT \\"/bin/sh ../node_modules/@sentry/react-native/scripts/sentry-xcode.sh $REACT_NATIVE_XCODE\\""
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
