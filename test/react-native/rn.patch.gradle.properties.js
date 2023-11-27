#!/usr/bin/env node

const fs = require('fs');
const { argv } = require('process');

const parseArgs = require('minimist');
const { logger } = require('@sentry/utils');
logger.enable();

const args = parseArgs(argv.slice(2));
if (!args['gradle-properties']) {
  throw new Error('Missing --gradle-properties');
}

if (!args['engine']) {
  throw new Error('Missing --engine');
}

const enableHermes = args['engine'] === 'hermes' ? true : args['engine'] === 'jsc' ? false : null;
if (enableHermes === null) {
  throw new Error('Invalid engine');
}

logger.info('Patching gradle.properties', args['gradle-properties']);
const content = fs.readFileSync(args['gradle-properties'], 'utf8');

const isHermesEnabled = content.includes('hermesEnabled=true');
const shouldPatch = enableHermes !== isHermesEnabled;
if (shouldPatch) {
  const patch = enableHermes ? 'hermesEnabled=true' : 'hermesEnabled=false';
  const patched = content.match(/hermesEnabled=.*/)
    ? content.replace(/hermesEnabled=.*/, patch)
    : content.concat(`\n${patch}`);
  if (enableHermes) {
    logger.info('Patching gradle.properties for Hermes');
  } else {
    logger.info('Patching gradle.properties for JSC');
  }
  fs.writeFileSync(args['gradle-properties'], patched);
} else {
  logger.info('gradle.properties is already patched!');
}
