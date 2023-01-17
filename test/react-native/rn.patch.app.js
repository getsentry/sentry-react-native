#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { argv } = require('process');

const parseArgs = require('minimist');
const { logger } = require('@sentry/utils');
logger.enable();

const args = parseArgs(argv.slice(2));
if (!args.app) {
  throw new Error('Missing --app');
}

logger.info('Patching RN App.(js|tsx)', args.app);

const patch = `
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://d870ad989e7046a8b9715a57f59b23b5@o447951.ingest.sentry.io/5428561',
});
`;
const lastImportRex = /^([^]*)(import\s+[^;]*?;$)/m;
const patchRex = '@sentry/react-native';

const jsPath = path.join(args.app, 'App.js');
const tsxPath = path.join(args.app, 'App.tsx');
const jsExists = fs.existsSync(jsPath);
const appPath = jsExists ? jsPath : tsxPath;
const app = fs.readFileSync(appPath, 'utf8');

const isPatched = app.match(patchRex);
if (!isPatched) {
  const patched = app.replace(lastImportRex, m => m + patch);

  fs.writeFileSync(appPath, patched);
  logger.info('Patched RN App.(js|tsx) successfully!');
} else {
  logger.info('App.(js|tsx) already patched!');
}
