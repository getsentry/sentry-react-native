#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { argv, env } = require('process');

const parseArgs = require('minimist');
const { debug } = require('@sentry/core');
debug.enable();

const SENTRY_RELEASE = env.SENTRY_RELEASE;
const SENTRY_DIST = env.SENTRY_DIST;

const args = parseArgs(argv.slice(2));
if (!args.app) {
  throw new Error('Missing --app');
}

debug.log('Patching RN App.(js|tsx)', args.app);

const initPatch = `
import * as Sentry from '@sentry/react-native';
import { EndToEndTestsScreen } from 'sentry-react-native-e2e-tests';
import { LaunchArguments } from "react-native-launch-arguments";

const launchArgs = LaunchArguments.value();

// Parse launch arguments, handling both number and string types
const parseRate = (value) => {
  if (value === undefined || value === null || value === 'undefined') {
    return undefined;
  }
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return isNaN(parsed) ? undefined : parsed;
};

const replaysOnErrorSampleRate = parseRate(launchArgs.replaysOnErrorSampleRate);
const replaysSessionSampleRate = parseRate(launchArgs.replaysSessionSampleRate);

console.log('[E2E] LaunchArguments raw:', JSON.stringify(launchArgs));
console.log('[E2E] Parsed replaysOnErrorSampleRate:', replaysOnErrorSampleRate, typeof replaysOnErrorSampleRate);
console.log('[E2E] Parsed replaysSessionSampleRate:', replaysSessionSampleRate, typeof replaysSessionSampleRate);

Sentry.init({
  release: '${SENTRY_RELEASE}',
  dist: '${SENTRY_DIST}',
  dsn: 'https://1df17bd4e543fdb31351dee1768bb679@o447951.ingest.sentry.io/5428561',
  replaysOnErrorSampleRate: replaysOnErrorSampleRate,
  replaysSessionSampleRate: replaysSessionSampleRate,
  integrations: [
    Sentry.mobileReplayIntegration(),
    Sentry.feedbackIntegration({
      enableTakeScreenshot: true,
    }),
  ],
});
`;
const e2eComponentPatch = '<EndToEndTestsScreen />';
const lastImportRex = /^([^]*)(import\s+[^;]*?;$)/m;
const patchRex = '@sentry/react-native';
// Support both older RN versions with ScrollView and newer versions with NewAppScreen
const headerComponentRex = /(<ScrollView|<NewAppScreen)/gm;
const exportDefaultRex = /export\s+default\s+App;/m;

const jsPath = path.join(args.app, 'App.js');
const tsxPath = path.join(args.app, 'App.tsx');
const jsExists = fs.existsSync(jsPath);
const appPath = jsExists ? jsPath : tsxPath;
const app = fs.readFileSync(appPath, 'utf8');

const isPatched = app.match(patchRex);
const hasOldExperimentsFormat = app.includes('_experiments:');

if (!isPatched) {
  // Fresh app - apply full patch
  const patched = app
    .replace(lastImportRex, m => m + initPatch)
    .replace(headerComponentRex, m => e2eComponentPatch + m)
    .replace(exportDefaultRex, 'export default Sentry.wrap(App);');

  fs.writeFileSync(appPath, patched);
  debug.log('Patched RN App.(js|tsx) successfully!');
} else if (hasOldExperimentsFormat) {
  // Old patch detected - replace entire Sentry.init block with new format
  debug.log('Detected old _experiments format, updating to new format...');
  
  // Remove old Sentry imports and init (everything between the Sentry import and the first type/function definition)
  const oldPatchRemovalRex = /import \* as Sentry from '@sentry\/react-native';[\s\S]*?Sentry\.init\({[\s\S]*?\}\);[\s\S]*?(?=\n\n|type |function |const |class |export )/m;
  
  const patched = app.replace(oldPatchRemovalRex, initPatch + '\n\n');
  
  fs.writeFileSync(appPath, patched);
  debug.log('Updated patch from old _experiments format to new format successfully!');
} else {
  debug.log('App.(js|tsx) already patched with current format!');
}
