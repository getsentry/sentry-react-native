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

const importSerializer =
  "const {createSentryMetroSerializer} = require('@sentry/react-native/dist/js/tools/sentryMetroSerializer');";
const serializerValue = 'serializer: { customSerializer: createSentryMetroSerializer(), },';
const enterSerializerBefore = '};';

let config = fs.readFileSync(configFilePath, 'utf8').split('\n');

const isPatched = config.includes(line => line.includes(importSerializer));
if (!isPatched) {
  config = [importSerializer, ...config];
  const lineIndex = config.findIndex(line => line.includes(enterSerializerBefore));
  const lineParsed = config[lineIndex].split(enterSerializerBefore);
  lineParsed.push(serializerValue, enterSerializerBefore);
  config[lineIndex] = lineParsed.join('');
  fs.writeFileSync(configFilePath, config.join('\n'), 'utf8');
  logger.info('Patched Metro config successfully!');
} else {
  logger.info('Metro config already patched!');
}
