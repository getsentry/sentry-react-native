#!/usr/bin/env node
'use strict';

import { execSync, spawn } from 'child_process';
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
  env.SENTRY_DISABLE_AUTO_UPLOAD = 'true'
}

if (env.PRODUCTION === undefined && env.CI == undefined) {
  // When executed locally and PROD not specified most likely we wanted production build
  env.PRODUCTION = 1;
}

if (!env.USE_FRAMEWORKS || env.USE_FRAMEWORKS === 'no') {
  // In case it's set to an empty string, it causes issues in Podfile.
  delete env.USE_FRAMEWORKS;
}

if (platform == 'ios') {
  // Flipper is causing build issues on iOS, so we disable it
  env.NO_FLIPPER = 1
}

const rootDir = path.resolve(__dirname, '..');
const rootPackageJson = JSON.parse(fs.readFileSync(`${rootDir}/package.json`, 'utf8'));
const RNVersion = env.RN_VERSION ? env.RN_VERSION : rootPackageJson.devDependencies['react-native'];
const RNEngine = env.RN_ENGINE ? env.RN_ENGINE : 'hermes';
const buildType = env.PRODUCTION ? 'Release' : 'Debug';
const appSourceRepo = 'https://github.com/react-native-community/rn-diff-purge.git';
const appRepoDir = `${rootDir}/test/react-native/versions/${RNVersion}`;
const appName = 'RnDiffApp';
const appDir = `${appRepoDir}/${appName}`;
const e2eDir = `${rootDir}/test/e2e`;
const testAppName = `${appName}.${platform == 'ios' ? 'app' : 'apk'}`;
const runtime = env.IOS_RUNTIME ? env.IOS_RUNTIME : 'latest';
const device = env.IOS_DEVICE ? env.IOS_DEVICE : 'iPhone 15';

// Build and publish the SDK - we only need to do this once in CI.
// Locally, we may want to get updates from the latest build so do it on every app build.
if (actions.includes('create') || (env.CI === undefined && actions.includes('build'))) {
  execSync(`yarn build`, { stdio: 'inherit', cwd: rootDir, env: env });
  execSync(`yalc publish`, { stdio: 'inherit', cwd: rootDir, env: env });
  execSync(`yarn build`, { stdio: 'inherit', cwd: e2eDir, env: env });
}

if (actions.includes('create')) {
  // Clone the test app repo
  if (fs.existsSync(appRepoDir)) fs.rmSync(appRepoDir, { recursive: true });
  execSync(`git clone ${appSourceRepo} --branch release/${RNVersion} --single-branch ${appRepoDir}`, { stdio: 'inherit', env: env });

  // Install dependencies
  // yalc add doesn't fail if the package is not found - it skips silently.
  const yalcAddOutput = execSync(`yalc add @sentry/react-native`, { cwd: appDir, env: env, encoding: 'utf-8' });
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
    stdio: 'inherit', cwd: appDir,
    // yarn v3 run immutable install by default in CI
    env: Object.assign(env, { YARN_ENABLE_IMMUTABLE_INSTALLS: false })
  });

  execSync(`yarn add ../../../../e2e`, { stdio: 'inherit', cwd: appDir, env: env });

  // Patch the app
  execSync(`patch --verbose --strip=0 --force --ignore-whitespace --fuzz 4 < ../../../rn.patch`, { stdio: 'inherit', cwd: appDir, env: env });
  execSync(`../../../rn.patch.app.js --app .`, { stdio: 'inherit', cwd: appDir, env: env });
  execSync(`../../../rn.patch.metro.config.js --path metro.config.js`, { stdio: 'inherit', cwd: appDir, env: env });

  // Set up platform-specific app configuration
  if (platform == 'ios') {
    execSync('ruby --version', { stdio: 'inherit', cwd: `${appDir}`, env: env });

    execSync(`../../../../rn.patch.podfile.js --pod-file Podfile --engine ${RNEngine}`, { stdio: 'inherit', cwd: `${appDir}/ios`, env: env });

    if (fs.existsSync(`${appDir}/Gemfile`)) {
      execSync(`bundle install`, { stdio: 'inherit', cwd: appDir, env: env });
      execSync('bundle exec pod install --repo-update', { stdio: 'inherit', cwd: `${appDir}/ios`, env: env });
    } else {
      execSync('pod install --repo-update', { stdio: 'inherit', cwd: `${appDir}/ios`, env: env });
    }
    execSync('cat Podfile.lock | grep RNSentry', { stdio: 'inherit', cwd: `${appDir}/ios`, env: env });

    execSync(`../../../rn.patch.xcode.js --project ios/${appName}.xcodeproj/project.pbxproj --rn-version ${RNVersion}`, { stdio: 'inherit', cwd: appDir, env: env });
  } else if (platform == 'android') {
    execSync(`../../../rn.patch.gradle.properties.js --gradle-properties android/gradle.properties --engine ${RNEngine}`, { stdio: 'inherit', cwd: appDir, env: env });
    execSync(`../../../rn.patch.app.build.gradle.js --app-build-gradle android/app/build.gradle`, { stdio: 'inherit', cwd: appDir, env: env });

    if (env.RCT_NEW_ARCH_ENABLED) {
      execSync(`perl -i -pe's/newArchEnabled=false/newArchEnabled=true/g' android/gradle.properties`, { stdio: 'inherit', cwd: appDir, env: env });
      console.log('New Architecture enabled');
    }
  }
}

if (actions.includes('build')) {
  // This prevents modules resolution from outside of the RN Test App projects during the native app build.
  // See https://github.com/getsentry/sentry-react-native/pull/3409
  console.log('Renaming node_modules to node_modules.bak');
  fs.renameSync(`${rootDir}/node_modules`, `${rootDir}/node_modules.bak`);

  try {
    console.log(`Building ${platform}: ${buildType}`);
    var appProduct;

    if (platform == 'ios') {
      // Build iOS test app
      execSync(`set -o pipefail && xcodebuild \
                    -workspace ${appName}.xcworkspace \
                    -configuration ${buildType} \
                    -scheme ${appName} \
                    -destination 'platform=iOS Simulator,OS=${runtime},name=${device}' \
                    ONLY_ACTIVE_ARCH=yes \
                    -derivedDataPath DerivedData \
                    build | tee xcodebuild.log | xcbeautify`,
        { stdio: 'inherit', cwd: `${appDir}/ios`, env: env });

      appProduct = `${appDir}/ios/DerivedData/Build/Products/${buildType}-iphonesimulator/${appName}.app`;
    } else if (platform == 'android') {
      execSync(`./gradlew assemble${buildType} -PreactNativeArchitectures=x86 --no-daemon`,
        { stdio: 'inherit', cwd: `${appDir}/android`, env: env });
      appProduct = `${appDir}/android/app/build/outputs/apk/release/app-release.apk`;
    }

    var testApp = `${e2eDir}/${testAppName}`;
    console.log(`Moving ${appProduct} to ${testApp}`);
    if (fs.existsSync(testApp)) fs.rmSync(testApp, { recursive: true });
    fs.renameSync(appProduct, testApp);
  } finally {
    console.log('Restoring node_modules from node_modules.bak');
    fs.renameSync(`${rootDir}/node_modules.bak`, `${rootDir}/node_modules`);
  }
}

if (actions.includes('test')) {
  if (platform == 'ios' && !fs.existsSync(`${e2eDir}/DerivedData/Build/Products/Debug-iphonesimulator/WebDriverAgentRunner-Runner.app`)) {
    // Build iOS WebDriverAgent
    execSync(`set -o pipefail && xcodebuild \
                  -project node_modules/appium-webdriveragent/WebDriverAgent.xcodeproj \
                  -scheme WebDriverAgentRunner \
                  -destination 'platform=iOS Simulator,OS=${runtime},name=${device}' \
                  GCC_TREAT_WARNINGS_AS_ERRORS=0 \
                  COMPILER_INDEX_STORE_ENABLE=NO \
                  ONLY_ACTIVE_ARCH=yes \
                  -derivedDataPath DerivedData \
                  build | tee xcodebuild-agent.log | xcbeautify`,
      { stdio: 'inherit', cwd: e2eDir, env: env });
  }

  // Start the appium server.
  var processesToKill = {};
  async function newProcess(name, process) {
    await new Promise((resolve, reject) => {
      process.on('error', (e) => {
        console.error(`Failed to start process '${name}': ${e}`);
        reject(e);
      });
      process.on('spawn', () => {
        console.log(`Process '${name}' (${process.pid}) started`);
        resolve();
      });
    });

    processesToKill[name] = {
      process: process,
      complete: new Promise((resolve, _reject) => {
        process.on('close', resolve);
      })
    };
  }
  await newProcess('appium', spawn('node_modules/.bin/appium', ['--log-timestamp', '--log-no-colors', '--log', `appium${platform}.log`], { stdio: 'inherit', cwd: e2eDir, env: env, shell: false }));

  try {
    await waitForAppium();

    // Run e2e tests
    const testEnv = env;
    testEnv.PLATFORM = platform;
    testEnv.APPIUM_APP = `./${testAppName}`;

    if (platform == 'ios') {
      testEnv.APPIUM_DERIVED_DATA = 'DerivedData';
    } else if (platform == 'android') {
      execSync(`adb devices -l`, { stdio: 'inherit', cwd: e2eDir, env: env });

      execSync(`adb logcat -c`, { stdio: 'inherit', cwd: e2eDir, env: env });

      var adbLogStream = fs.createWriteStream(`${e2eDir}/adb.log`);
      const adbLogProcess = spawn('adb', ['logcat'], { cwd: e2eDir, env: env, shell: false })
      adbLogProcess.stdout.pipe(adbLogStream);
      adbLogProcess.stderr.pipe(adbLogStream);
      adbLogProcess.on('close', () => adbLogStream.close())
      await newProcess('adb logcat', adbLogProcess);
    }

    execSync(`yarn test --verbose`, { stdio: 'inherit', cwd: e2eDir, env: testEnv });
  } finally {
    for (const [name, info] of Object.entries(processesToKill)) {
      console.log(`Sending termination signal to process '${name}' (${info.process.pid})`);

      // Send SIGTERM first to allow graceful shutdown.
      info.process.kill(15);

      // Also send SIGKILL after 10 seconds.
      const killTimeout = setTimeout(() => process.kill(9), "10000");

      // Wait for the process to exit (either via SIGTERM or SIGKILL).
      const code = await info.complete;

      // Successfully exited now, no need to kill (if it hasn't run yet).
      clearTimeout(killTimeout);

      console.log(`Process '${name}' (${info.process.pid}) exited with code ${code}`);
    }
  }
}

async function waitForAppium() {
  console.log("Waiting for Appium server to start...");
  for (let i = 0; i < 60; i++) {
    try {
      await fetch("http://127.0.0.1:4723/sessions", { method: "HEAD" });
      console.log("Appium server started");
      return;
    } catch (error) {
      console.log(`Appium server hasn't started yet (${error})...`);
      await sleep(1000);
    }
  }
  throw new Error("Appium server failed to start");
}

async function sleep(millis) {
  return new Promise(resolve => setTimeout(resolve, millis));
}
