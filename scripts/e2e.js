#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { argv, env } = require('process');

if (argv.length < 3) {
  console.error(`Usage: ${path.basename(__filename)} <platform>`);
  process.exit(1);
}

const platform = argv[2];
const rootDir = path.resolve(__dirname, '..');
const rootPackageJson = JSON.parse(fs.readFileSync(`${rootDir}/package.json`, 'utf8'));

const RNVersion = env['RN_VERSION'] ? env['RN_VERSION'] : rootPackageJson.devDependencies['react-native'];
const appSourceRepo = 'https://github.com/react-native-community/rn-diff-purge.git';
const appRepoDir = `${rootDir}/test/react-native/versions/${RNVersion}`;
const appDir = `${appRepoDir}/RnDiffApp`;
const RNSentryPodName = 'RNSentry';

if (fs.existsSync(appRepoDir)) {
  execSync(`rm -rf ${appRepoDir}`);
}

execSync(`git clone ${appSourceRepo}  --branch release/${RNVersion} --single-branch ${appRepoDir}`, { stdio: 'inherit', env: env });
execSync(`yalc add @sentry/react-native`, { stdio: 'inherit', cwd: appDir, env: env });
execSync(`yarn install`, { stdio: 'inherit', cwd: appDir, env: env });
execSync(`yarn add ../../../../e2e`, { stdio: 'inherit', cwd: appDir, env: env });

if (platform == 'ios') {
  // Fixes Hermes pod install https://github.com/CocoaPods/CocoaPods/issues/12226#issuecomment-1930604302
  execSync(`gem install cocoapods -v 1.15.2`, { stdio: 'inherit', cwd: appDir, env: env });

  
}
