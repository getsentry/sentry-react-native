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
if (platform !== 'ios' && platform !== 'android') {
  console.error(`Unsupported platform: ${platform}`);
  process.exit(1);
}

var actions = ['create', 'build', 'test'];
if (argv.length >= 4) {
  var newActions = [];
  for (let index = 0; index < actions.length; index++) {
    const action = actions[index];
    if (argv.includes(`--${action}`)) {
      newActions.push(action);
    }
  }
  actions = newActions;
}

const rootDir = path.resolve(__dirname, '..');
const rootPackageJson = JSON.parse(fs.readFileSync(`${rootDir}/package.json`, 'utf8'));

const RNVersion = env.RN_VERSION ? env.RN_VERSION : rootPackageJson.devDependencies['react-native'];
const RNEngine = env.RN_ENGINE ? env.RN_ENGINE : 'hermes';
const buildType = env.PRODUCTION ? 'Release' : 'Debug';

const appSourceRepo = 'https://github.com/react-native-community/rn-diff-purge.git';
const appRepoDir = `${rootDir}/test/react-native/versions/${RNVersion}`;
const appDir = `${appRepoDir}/RnDiffApp`;

if (env.USE_FRAMEWORKS) {
  env.NO_FLIPPER = 1;
}

// Build and publish the SDK
execSync(`yarn build`, { stdio: 'inherit', cwd: rootDir, env: env });
execSync(`yalc publish`, { stdio: 'inherit', cwd: rootDir, env: env });

// Build e2e tests
execSync(`yarn build`, { stdio: 'inherit', cwd: `${rootDir}/test/e2e`, env: env });

if (actions.includes('create')) {
  // Clone the test app repo
  if (fs.existsSync(appRepoDir)) execSync(`rm -rf ${appRepoDir}`);
  execSync(`git clone ${appSourceRepo}  --branch release/${RNVersion} --single-branch ${appRepoDir}`, { stdio: 'inherit', env: env });

  // Install dependencies
  // yalc add doesn't fail if the package is not found - it skips silently.
  const yalcAddOutput = execSync(`yalc add @sentry/react-native`, { cwd: appDir, env: env, encoding: 'utf-8' });
  if (!yalcAddOutput.match(/Package .* added ==>/)) {
    console.error(yalcAddOutput);
    process.exit(1);
  } else {
    console.log(yalcAddOutput.trim());
  }
  execSync(`yarn install`, { stdio: 'inherit', cwd: appDir, env: env });
  execSync(`yarn add ../../../../e2e`, { stdio: 'inherit', cwd: appDir, env: env });

  // Patch the app
  execSync(`patch --verbose --strip=0 --force --ignore-whitespace --fuzz 4 < ../../../rn.patch`, { stdio: 'inherit', cwd: appDir, env: env });
  execSync(`../../../rn.patch.app.js --app .`, { stdio: 'inherit', cwd: appDir, env: env });
  execSync(`../../../rn.patch.metro.config.js --path metro.config.js`, { stdio: 'inherit', cwd: appDir, env: env });

  // Set up platform-specific app configuration
  if (platform == 'ios') {
    execSync('ruby --version', { stdio: 'inherit', cwd: `${appDir}`, env: env });

    // Fixes Hermes pod install https://github.com/CocoaPods/CocoaPods/issues/12226#issuecomment-1930604302
    execSync(`gem install cocoapods -v 1.15.2`, { stdio: 'inherit', cwd: appDir, env: env });
    execSync(`../../../../rn.patch.podfile.js --pod-file Podfile --engine ${RNEngine}`, { stdio: 'inherit', cwd: `${appDir}/ios`, env: env });

    console.log(env);
    // const podInstallCommand = RNVersion === '0.65.3' ? 'pod install' : 'bundle exec pod install';
    execSync('pod install --repo-update', { stdio: 'inherit', cwd: `${appDir}/ios`, env: env });
    execSync('cat Podfile.lock | grep RNSentry', { stdio: 'inherit', cwd: `${appDir}/ios`, env: env });

    execSync(`../../../rn.patch.xcode.js --project ios/RnDiffApp.xcodeproj/project.pbxproj --rn-version ${RNVersion}`, { stdio: 'inherit', cwd: appDir, env: env });
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
  console.log(`Building ${platform}: ${buildType}`);

  if (platform == 'ios') {
    const runtime = env.IOS_RUNTIME ? env.IOS_RUNTIME : 'latest';
    const device = env.IOS_DEVICE ? env.IOS_DEVICE : 'iPhone 14';
    const derivedData = `${appDir}/ios/DerivedData`
    fs.mkdirSync(derivedData, { recursive: true });
    execSync(`set -o pipefail && xcodebuild \
    -workspace RnDiffApp.xcworkspace \
    -configuration ${buildType} \
    -scheme RnDiffApp \
    -destination 'platform=iOS Simulator,OS=${runtime},name=${device}' \
    ONLY_ACTIVE_ARCH=yes \
    CODE_SIGN_IDENTITY='' \
    CODE_SIGNING_REQUIRED=NO \
    -derivedDataPath ${derivedData} \
    build | tee xcodebuild.log | xcbeautify`,
      { stdio: 'inherit', cwd: `${appDir}/ios`, env: env });
  } else if (platform == 'android') {
    execSync(`./gradlew assemble${buildType} -PreactNativeArchitectures=x86`, { stdio: 'inherit', cwd: `${appDir}/android`, env: env });
  }
}
