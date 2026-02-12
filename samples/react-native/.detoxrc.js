const process = require('process');

/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: {},
  apps: {
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
    'ci.emulator': {
      type: process.env.ANDROID_TYPE?.trim(),
      device: {
        avdName: process.env.ANDROID_AVD_NAME?.trim(),
        adbName: process.env.ANDROID_ADB_NAME?.trim(),
      },
    },
    'ci.simulator': {
      type: 'ios.simulator',
      device: {
        type: process.env.IOS_DEVICE?.trim(),
        os: process.env.IOS_VERSION?.trim(),
      },
    },
  },
  configurations: {
    'ci.android': {
      device: 'ci.emulator',
      app: 'ci.android',
      testRunner: {
        args: {
          $0: 'jest',
          config: 'e2e-detox/jest.config.android.js',
        },
        jest: {
          setupTimeout: 120000,
        },
      },
    },
    'ci.sim.auto': {
      device: 'ci.simulator',
      app: 'ci.ios',
      testRunner: {
        args: {
          $0: 'jest',
          config: 'e2e-detox/jest.config.ios.auto.js',
        },
        jest: {
          setupTimeout: 120000,
        },
      },
    },
    'ci.sim.manual': {
      device: 'ci.simulator',
      app: 'ci.ios',
      testRunner: {
        args: {
          $0: 'jest',
          config: 'e2e-detox/jest.config.ios.manual.js',
        },
        jest: {
          setupTimeout: 120000,
        },
      },
    },
  },
};
