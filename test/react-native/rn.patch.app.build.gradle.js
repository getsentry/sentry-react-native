#!/usr/bin/env node

const fs = require('fs');
const { argv } = require('process');

const parseArgs = require('minimist');
const { logger } = require('@sentry/utils');
logger.enable();

const args = parseArgs(argv.slice(2));
if (!args['app-build-gradle']) {
  throw new Error('Missing --app-build-gradle');
}

logger.info('Patching app/build.gradle', args['app-build-gradle']);

const sentryGradlePatch = `
apply from: "../../node_modules/@sentry/react-native/sentry.gradle"

`;
const reactNativeGradleRex = /^android {/m;

const buildGradle = fs.readFileSync(args['app-build-gradle'], 'utf8');

const isPatched = buildGradle.match(sentryGradlePatch.trim());
if (!isPatched) {
  const patched = buildGradle.replace(reactNativeGradleRex, m => sentryGradlePatch + m);

  fs.writeFileSync(args['app-build-gradle'], patched);
  logger.info('Patched app/build.gradle successfully!');
} else {
  logger.info('app/build.gradle is already patched!');
}
