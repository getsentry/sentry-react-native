#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { argv, env } = require('process');

const parseArgs = require('minimist');
const { logger } = require('@sentry/core');
logger.enable();

const SENTRY_RELEASE = env.SENTRY_RELEASE;
const SENTRY_DIST = env.SENTRY_DIST;

const args = parseArgs(argv.slice(2));
if (!args.app) {
  throw new Error('Missing --app');
}

logger.info('Patching RN App.(js|tsx)', args.app);

const initPatch = `
import * as Sentry from '@sentry/react-native';
import { EndToEndTestsScreen } from 'sentry-react-native-e2e-tests';
import { LaunchArguments } from "react-native-launch-arguments";

Sentry.init({
  release: '${SENTRY_RELEASE}',
  dist: '${SENTRY_DIST}',
  dsn: 'https://1df17bd4e543fdb31351dee1768bb679@o447951.ingest.sentry.io/5428561',
  _experiments: {
    replaysOnErrorSampleRate: LaunchArguments.value().replaysOnErrorSampleRate,
  },
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
if (!isPatched) {
  const patched = app
    .replace(lastImportRex, m => m + initPatch)
    .replace(headerComponentRex, m => e2eComponentPatch + m)
    .replace(exportDefaultRex, 'export default Sentry.wrap(App);');

  fs.writeFileSync(appPath, patched);
  logger.info('Patched RN App.(js|tsx) successfully!');
} else {
  logger.info('App.(js|tsx) already patched!');
}
