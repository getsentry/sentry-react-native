const process = require('process');

/** @type {Detox.DetoxConfig} */
const testRunnerIos = {
  args: {
    $0: 'jest',
    config: 'e2e/jest.config.ios.js',
  },
  jest: {
    setupTimeout: 120000,
  },
};

const testRunnerAos = {
  args: {
    $0: 'jest',
    config: 'e2e/jest.config.android.js',
  },
  jest: {
    setupTimeout: 120000,
  },
};

module.exports = {
  testRunner: {},
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath:
        'ios/build/Build/Products/Debug-iphonesimulator/sentryreactnativesample.app',
      build:
        'xcodebuild -workspace ios/sentryreactnativesample.xcworkspace -scheme sentryreactnativesample -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build',
    },
    'ios.release': {
      type: 'ios.app',
      binaryPath:
        'ios/build/Build/Products/Release-iphonesimulator/sentryreactnativesample.app',
      build:
        'xcodebuild -workspace ios/sentryreactnativesample.xcworkspace -scheme sentryreactnativesample -configuration Release -sdk iphonesimulator -derivedDataPath ios/build',
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      build:
        'cd android && ./gradlew app:assembleDebug app:assembleAndroidTest -DtestBuildType=debug',
      reversePorts: [8081],
    },
    'android.release': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/release/app-release.apk',
      build:
        'cd android && ./gradlew app:assembleRelease app:assembleAndroidTest -DtestBuildType=release',
    },
    'ci.android': {
      type: 'android.apk',
      binaryPath: 'app.apk',
      testBinaryPath: 'app-androidTest.apk',
    },
    'ci.ios': {
      type: 'ios.app',
      binaryPath: 'sentryreactnativesample.app',
    },
  },
  devices: {
    simulator: {
      type: 'ios.simulator',
      device: {
        type: 'iPhone 16',
      },
    },
    attached: {
      type: 'android.attached',
      device: {
        adbName: '.*',
      },
    },
    emulator: {
      type: 'android.emulator',
      device: {
        avdName: 'Pixel_9_API_35',
      },
    },
    'ci.emulator': {
      type: 'android.emulator',
      device: {
        avdName: process.env.ANDROID_AVD_NAME,
      },
    },
    'ci.simulator': {
      type: 'ios.simulator',
      device: {
        type: process.env.IOS_DEVICE,
        os: process.env.IOS_VERSION,
      },
    },
  },
  configurations: {
    'ios.sim.debug': {
      device: 'simulator',
      app: 'ios.debug',
      testRunner: testRunnerIos,
    },
    'ios.sim.release': {
      device: 'simulator',
      app: 'ios.release',
      testRunner: testRunnerIos,
    },
    'android.att.debug': {
      device: 'attached',
      app: 'android.debug',
      testRunner: testRunnerAos,
    },
    'android.att.release': {
      device: 'attached',
      app: 'android.release',
      testRunner: testRunnerAos,
    },
    'android.emu.debug': {
      device: 'emulator',
      app: 'android.debug',
      testRunner: testRunnerAos,
    },
    'android.emu.release': {
      device: 'emulator',
      app: 'android.release',
      testRunner: testRunnerAos,
    },
    'ci.android': {
      device: 'ci.emulator',
      app: 'ci.android',
      testRunner: testRunnerAos,
    },
    'ci.sim': {
      device: 'ci.simulator',
      app: 'ci.ios',
      testRunner: testRunnerIos,
    },
  },
};
