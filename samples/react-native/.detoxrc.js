const process = require('process');

const baseConfig = jestConfig => ({
  testRunner: {
    args: {
      $0: 'jest',
      config: jestConfig,
    },
    jest: {
      setupTimeout: 120000,
    },
  },
});

const androidConfig = () => ({
  device: 'ci.emulator',
  app: 'ci.android',
});

const iosConfig = () => ({
  device: 'ci.simulator',
  app: 'ci.ios',
});

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
    'ci.android.auto': {
      ...baseConfig('e2e/jest.config.android.auto.js'),
      ...androidConfig(),
    },
    'ci.android.manual': {
      ...baseConfig('e2e/jest.config.android.manual.js'),
      ...androidConfig(),
    },
    'ci.sim.auto': {
      ...baseConfig('e2e/jest.config.ios.auto.js'),
      ...iosConfig(),
    },
    'ci.sim.manual': {
      ...baseConfig('e2e/jest.config.ios.manual.js'),
      ...iosConfig(),
    },
  },
};
