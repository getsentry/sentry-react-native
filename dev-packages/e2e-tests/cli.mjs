#!/usr/bin/env node
'use strict';

import { execSync, execFileSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { argv, env } from 'process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (argv.length < 3) {
  console.error(`Usage: ${path.basename(__filename)} <platform>`);
  process.exit(1);
}

const platform = argv[2];
if (platform !== 'ios' && platform !== 'android') {
  console.error(`Unsupported platform: ${platform}`);
  process.exit(1);
}

var actions = ['create', 'build', 'test'];
if (argv.length >= 4) {
  var newActions = [];
  for (let index = 0; index < actions.length; index++) {
    const action = actions[index];
    if (argv.includes(`--${action}`) || argv.includes(`-${action}`) || argv.includes(action)) {
      newActions.push(action);
    }
  }
  actions = newActions;
}
console.log(`Performing actions: ${actions}`);

if (env.SENTRY_DISABLE_AUTO_UPLOAD === undefined) {
  // Auto upload to prod made the CI flaky
  // This can be removed in the future or when mocked server is added
  env.SENTRY_DISABLE_AUTO_UPLOAD = 'true';
}

if (env.PRODUCTION === undefined && env.CI == undefined) {
  // When executed locally and PROD not specified most likely we wanted production build
  env.PRODUCTION = 1;
}

if (!env.USE_FRAMEWORKS || env.USE_FRAMEWORKS === 'no') {
  // In case it's set to an empty string, it causes issues in Podfile.
  delete env.USE_FRAMEWORKS;
}

const e2eDir = path.resolve(__dirname);
const e2eTestPackageName = JSON.parse(fs.readFileSync(`${e2eDir}/package.json`, 'utf8')).name;
const patchScriptsDir = path.resolve(e2eDir, 'patch-scripts');
const workspaceRootDir = path.resolve(__dirname, '../..');
const corePackageDir = path.resolve(workspaceRootDir, 'packages/core');
const corePackageJson = JSON.parse(fs.readFileSync(`${corePackageDir}/package.json`, 'utf8'));
const RNVersion = env.RN_VERSION ? env.RN_VERSION : corePackageJson.devDependencies['react-native'];
const RNEngine = env.RN_ENGINE ? env.RN_ENGINE : 'hermes';
const buildType = env.PRODUCTION ? 'Release' : 'Debug';
const appSourceRepo = 'https://github.com/react-native-community/rn-diff-purge.git';
const appRepoDir = `${e2eDir}/react-native-versions/${RNVersion}`;
const appName = 'RnDiffApp';
const appDir = `${appRepoDir}/${appName}`;
const testAppName = `${appName}.${platform === 'ios' ? 'app' : 'apk'}`;
const testApp = `${e2eDir}/${testAppName}`;
const appId = platform === 'ios' ? 'org.reactjs.native.example.RnDiffApp' : 'com.rndiffapp';
const sentryAuthToken = env.SENTRY_AUTH_TOKEN;

function runCodegenIfNeeded(rnVersion, platform, appDir) {
  const versionNumber = parseFloat(rnVersion.replace(/[^\d.]/g, ''));
  const shouldRunCodegen = platform === 'android' && versionNumber >= 0.80;

  if (shouldRunCodegen) {
    console.log(`Running codegen for React Native ${rnVersion}...`);
    try {
      execSync('./gradlew generateCodegenArtifactsFromSchema', {
        stdio: 'inherit',
        cwd: path.join(appDir, 'android'),
        env: env
      });
      console.log('Gradle codegen task completed successfully');
    } catch (error) {
      console.error('Codegen failed:', error.message);
    }
  } else {
    console.log(`Skipping codegen for React Native ${rnVersion}`);
  }
}

function patchBoostIfNeeded(rnVersion, patchScriptsDir) {
  const versionNumber = parseFloat(rnVersion.replace(/[^\d.]/g, ''));
  const shouldPatchBoost = platform === 'ios' && versionNumber <= 0.80;

  if (!shouldPatchBoost) {
    console.log(`Skipping boost patch for React Native ${rnVersion}`);
    return;
  }
  execSync(`${patchScriptsDir}/rn.patch.boost.js --podspec node_modules/react-native/third-party-podspecs/boost.podspec`, {
    stdio: 'inherit',
    cwd: appDir,
    env: env,
  });
}

// Build and publish the SDK - we only need to do this once in CI.
// Locally, we may want to get updates from the latest build so do it on every app build.
if (actions.includes('create') || (env.CI === undefined && actions.includes('build'))) {
  execSync(`yarn build`, { stdio: 'inherit', cwd: workspaceRootDir, env: env });
  execSync(`yalc publish --private`, { stdio: 'inherit', cwd: e2eDir, env: env });
  execSync(`yalc publish`, { stdio: 'inherit', cwd: corePackageDir, env: env });
}

if (actions.includes('create')) {
  // Clone the test app repo
  if (fs.existsSync(appRepoDir)) fs.rmSync(appRepoDir, { recursive: true });
  execSync(`git clone ${appSourceRepo} --branch release/${RNVersion} --single-branch ${appRepoDir}`, {
    stdio: 'inherit',
    env: env,
  });

  // Install dependencies
  // yalc add doesn't fail if the package is not found - it skips silently.
  let yalcAddOutput = execSync(`yalc add @sentry/react-native`, { cwd: appDir, env: env, encoding: 'utf-8' });
  if (!yalcAddOutput.match(/Package .* added ==>/)) {
    console.error(yalcAddOutput);
    process.exit(1);
  } else {
    console.log(yalcAddOutput.trim());
  }
  yalcAddOutput = execSync(`yalc add ${e2eTestPackageName}`, { cwd: appDir, env: env, encoding: 'utf-8' });
  if (!yalcAddOutput.match(/Package .* added ==>/)) {
    console.error(yalcAddOutput);
    process.exit(1);
  } else {
    console.log(yalcAddOutput.trim());
  }

  // original yarnrc contains the exact yarn version which causes corepack to fail to install yarn v3
  fs.writeFileSync(`${appDir}/.yarnrc.yml`, 'nodeLinker: node-modules', { encoding: 'utf-8' });
  // yarn v3 won't install dependencies in a sub project without a yarn.lock file present
  fs.writeFileSync(`${appDir}/yarn.lock`, '');

  execSync(`yarn install`, {
    stdio: 'inherit',
    cwd: appDir,
    // yarn v3 run immutable install by default in CI
    env: Object.assign(env, { YARN_ENABLE_IMMUTABLE_INSTALLS: false }),
  });

  execSync(`yarn add react-native-launch-arguments@4.0.2`, {
    stdio: 'inherit',
    cwd: appDir,
    // yarn v3 run immutable install by default in CI
    env: Object.assign(env, { YARN_ENABLE_IMMUTABLE_INSTALLS: false }),
  });

  // Patch react-native-launch-arguments for Gradle 9+ compatibility (Android) and React Native 0.84+ compatibility (iOS)
  execSync(`${patchScriptsDir}/rn.patch.launch-arguments.js --app-dir .`, {
    stdio: 'inherit',
    cwd: appDir,
    env: env,
  });

  // Patch the app
  execSync(`patch --verbose --strip=0 --force --ignore-whitespace --fuzz 4 < ${patchScriptsDir}/rn.patch`, {
    stdio: 'inherit',
    cwd: appDir,
    env: env,
  });
  execSync(`${patchScriptsDir}/rn.patch.app.js --app .`, { stdio: 'inherit', cwd: appDir, env: env });
  execSync(`${patchScriptsDir}/rn.patch.metro.config.js --path metro.config.js`, {
    stdio: 'inherit',
    cwd: appDir,
    env: env,
  });

  // Patch boost
  patchBoostIfNeeded(RNVersion, patchScriptsDir);

  // Set up platform-specific app configuration
  if (platform === 'ios') {
    execSync('ruby --version', { stdio: 'inherit', cwd: `${appDir}`, env: env });

    execSync(`${patchScriptsDir}/rn.patch.podfile.js --pod-file Podfile --engine ${RNEngine}`, {
      stdio: 'inherit',
      cwd: `${appDir}/ios`,
      env: env,
    });

    // Clean Pods to ensure CocoaPods reads the patched podspec
    if (fs.existsSync(`${appDir}/ios/Pods`)) {
      fs.rmSync(`${appDir}/ios/Pods`, { recursive: true });
    }
    if (fs.existsSync(`${appDir}/ios/Podfile.lock`)) {
      fs.rmSync(`${appDir}/ios/Podfile.lock`);
    }

    if (fs.existsSync(`${appDir}/Gemfile`)) {
      execSync(`bundle install`, { stdio: 'inherit', cwd: appDir, env: env });
      execSync('bundle exec pod install --repo-update', { stdio: 'inherit', cwd: `${appDir}/ios`, env: env });
    } else {
      execSync('pod install --repo-update', { stdio: 'inherit', cwd: `${appDir}/ios`, env: env });
    }
    execSync('cat Podfile.lock | grep RNSentry', { stdio: 'inherit', cwd: `${appDir}/ios`, env: env });

    execSync(
      `${patchScriptsDir}/rn.patch.xcode.js --project ios/${appName}.xcodeproj/project.pbxproj --rn-version ${RNVersion}`,
      { stdio: 'inherit', cwd: appDir, env: env },
    );
  } else if (platform === 'android') {
    execSync(
      `${patchScriptsDir}//rn.patch.gradle.properties.js --gradle-properties android/gradle.properties --engine ${RNEngine}`,
      { stdio: 'inherit', cwd: appDir, env: env },
    );
    execSync(`${patchScriptsDir}/rn.patch.app.build.gradle.js --app-build-gradle android/app/build.gradle`, {
      stdio: 'inherit',
      cwd: appDir,
      env: env,
    });

    if (env.RCT_NEW_ARCH_ENABLED) {
      execSync(`perl -i -pe's/newArchEnabled=false/newArchEnabled=true/g' android/gradle.properties`, {
        stdio: 'inherit',
        cwd: appDir,
        env: env,
      });
      console.log('New Architecture enabled');
    }
  }
}

if (actions.includes('build')) {
  console.log(`Building ${platform}: ${buildType}`);
  var appProduct;

  if (platform === 'ios') {
    // Build iOS test app
    execSync(
      `set -o pipefail && xcodebuild \
                  -workspace ${appName}.xcworkspace \
                  -configuration ${buildType} \
                  -scheme ${appName} \
                  -sdk 'iphonesimulator' \
                  -destination 'generic/platform=iOS Simulator' \
                  ONLY_ACTIVE_ARCH=yes \
                  -derivedDataPath DerivedData \
                  build | tee xcodebuild.log | xcbeautify`,
      { stdio: 'inherit', cwd: `${appDir}/ios`, env: env },
    );

    appProduct = `${appDir}/ios/DerivedData/Build/Products/${buildType}-iphonesimulator/${appName}.app`;
  } else if (platform === 'android') {
    runCodegenIfNeeded(RNVersion, platform, appDir);

    execSync(`./gradlew assemble${buildType} -PreactNativeArchitectures=x86 --no-daemon`, {
      stdio: 'inherit',
      cwd: `${appDir}/android`,
      env: env,
    });
    appProduct = `${appDir}/android/app/build/outputs/apk/release/app-release.apk`;
  }

  console.log(`Moving ${appProduct} to ${testApp}`);
  if (fs.existsSync(testApp)) fs.rmSync(testApp, { recursive: true });
  fs.renameSync(appProduct, testApp);
}

if (actions.includes('test')) {
  // Run e2e tests
  if (platform === 'ios') {
    try {
      execSync('xcrun simctl list devices | grep -q "(Booted)"');
    } catch (error) {
      throw new Error('No simulator is currently booted. Please boot a simulator before running this script.');
    }

    execFileSync('xcrun', ['simctl', 'install', 'booted', testApp]);
  } else if (platform === 'android') {
    try {
      execSync('adb devices | grep -q "emulator"');
    } catch (error) {
      throw new Error('No Android emulator is currently running. Please start an emulator before running this script.');
    }

    execFileSync('adb', ['install', '-r', '-d', testApp]);
  }

  if (!sentryAuthToken) {
    console.log('Skipping maestro test due to unavailable or empty SENTRY_AUTH_TOKEN');
  } else {
    try {
      execSync(
        `maestro test maestro \
          --env=APP_ID="${appId}" \
          --env=SENTRY_AUTH_TOKEN="${sentryAuthToken}" \
          --debug-output maestro-logs \
          --flatten-debug-output`,
        {
          stdio: 'inherit',
          cwd: e2eDir,
        },
      );
    } finally {
      // Always redact sensitive data, even if the test fails
      const redactScript = `
        if [[ "$(uname)" == "Darwin" ]]; then
          find ./maestro-logs -type f -exec sed -i '' "s/${sentryAuthToken}/[REDACTED]/g" {} +
          echo 'Redacted sensitive data from logs on MacOS'
        else
          find ./maestro-logs -type f -exec sed -i "s/${sentryAuthToken}/[REDACTED]/g" {} +
          echo 'Redacted sensitive data from logs on Ubuntu'
        fi
      `;

      try {
        execSync(redactScript, { stdio: 'inherit', cwd: e2eDir, shell: '/bin/bash' });
      } catch (error) {
        console.warn('Failed to redact sensitive data from logs:', error.message);
      }
    }
  }
}
