const path = require('path');
const baseConfig = require('./jest.config.base');

/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  ...baseConfig,
  globals: { E2E_PLATFORM: 'android' },
  globalSetup: path.resolve(__dirname, 'setup.android.auto.ts'),
  testMatch: [
    ...baseConfig.testMatch,
    '<rootDir>/e2e/**/*.test.android.ts',
    '<rootDir>/e2e/**/*.test.android.auto.ts',
  ],
};
