const fs = require('fs');
const { argv } = require('process');

const xcode = require('xcode');
const parseArgs = require('minimist');

const args = parseArgs(argv.slice(2));

const test = true;
let bundleScript = '';
let bundleScriptRegex = '';
let bundlePatchRegex = '';
let symbolsScript = '';
let symbolsPatchRegex = '';
if (test || args['rn-version'] === '<0.69') {
  bundleScript = bundleScriptRNOlderThan69;
} else if (args['rn-version'] === '>=0.69') {
  bundleScript = bundleScriptRNNewerOrEqualThan69;
} else {
  throw new Error('Unknown RN version');
}

const project = xcode.project('/Users/krystofwoldrich/repos/sentry-react-native/test/apps-repo-poc/versions/0.63.5/RnDiffApp/ios/RnDiffApp.xcodeproj/project.pbxproj');

project.parseSync();

const buildPhasesRaw = project.hash.project.objects.PBXShellScriptBuildPhase;
const buildPhases = [];
for (const key in buildPhasesRaw) {
  if (buildPhasesRaw.hasOwnProperty(key)
    && buildPhasesRaw[key].isa) {
    buildPhases.push(buildPhasesRaw[key]);
  }
}

buildPhases.forEach((phase) => {
  const isBundleReactNative = phase.shellScript.match(/\/scripts\/react-native-xcode\.sh/i);
  const isPatched = phase.shellScript.match(/sentry-cli\s+react-native\s+xcode/i);
  if (!isBundleReactNative || isPatched) {
    return;
  }
  phase.shellScript = bundleScript;
});

const isSymbolsPhase = (phase) => phase.shellScript.match(/sentry-cli\s+(upload-dsym|debug-files upload)/);
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
}

fs.writeFileSync(args.project, project.writeSync());
