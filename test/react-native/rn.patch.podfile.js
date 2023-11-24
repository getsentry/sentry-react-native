#!/usr/bin/env node

const fs = require('fs');
const { argv } = require('process');

const parseArgs = require('minimist');
const { logger } = require('@sentry/utils');
logger.enable();

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

logger.info('Patching Podfile', args['pod-file']);
const content = fs.readFileSync(args['pod-file'], 'utf8');

const isHermesEnabled = content.includes(':hermes_enabled => true,');
const shouldPatch = enableHermes !== isHermesEnabled;
if (shouldPatch) {
  const patched = content.replace(
    /:hermes_enabled.*/,
    enableHermes ? ':hermes_enabled => true,' : ':hermes_enabled => false,',
  );
  if (enableHermes) {
    logger.info('Patching Podfile for Hermes');
  } else {
    logger.info('Patching Podfile for JSC');
  }
  fs.writeFileSync(args['pod-file'], patched);
} else {
  logger.info('Podfile is already patched!');
}
