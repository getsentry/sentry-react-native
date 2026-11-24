const baseConfig = require('./jest.config.base');

/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  ...baseConfig,
  globals: { E2E_PLATFORM: 'android' },
  testMatch: [
    ...baseConfig.testMatch,
    '<rootDir>/e2e/**/*.test.android.ts',
    '<rootDir>/e2e/**/*.test.android.manual.ts',
  ],
};
