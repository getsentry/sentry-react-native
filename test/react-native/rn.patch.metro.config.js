#!/usr/bin/env node

const fs = require('fs');
const { argv } = require('process');

const parseArgs = require('minimist');
const { logger } = require('@sentry/utils');
logger.enable();

const args = parseArgs(argv.slice(2));
if (!args.path) {
  throw new Error('Missing --path');
}

logger.info('Patching Metro config: ', args.path);

const configFilePath = args.path;

const importSerializer = "const { withSentryConfig } = require('@sentry/react-native/metro');";

let config = fs.readFileSync(configFilePath, 'utf8').split('\n');

const isPatched = config.includes(importSerializer);
if (!isPatched) {
  config = [importSerializer, ...config];
  const moduleExportsLineIndex = config.findIndex(line => line.includes('module.exports ='));
  const endOfModuleExportsIndex = config.findIndex(line => line === '};');

  const lineParsed = config[moduleExportsLineIndex].split('=');
  if (lineParsed.length !== 2) {
    throw new Error('Failed to parse module.exports line');
  }
  const endsWithSemicolon = lineParsed[1].endsWith(';');
  if (endsWithSemicolon) {
    lineParsed[1] = lineParsed[1].slice(0, -1);
  }

  lineParsed[1] = `= withSentryConfig(${lineParsed[1]}${endsWithSemicolon ? ');' : ''}`;
  config[moduleExportsLineIndex] = lineParsed.join('');

  if (endOfModuleExportsIndex !== -1) {
    config[endOfModuleExportsIndex] = '});';
  }

  fs.writeFileSync(configFilePath, config.join('\n'), 'utf8');
  logger.info('Patched Metro config successfully!');
} else {
  logger.info('Metro config already patched!');
}
