const baseConfig = require('./jest.config.base');

/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  ...baseConfig,
  testMatch: [
    ...baseConfig.testMatch,
    '<rootDir>/e2e/**/*.test.android.ts',
    '<rootDir>/e2e/**/*.test.android.auto.ts',
  ],
};
