const baseConfig = require('./jest.config.base');

/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  ...baseConfig,
  testMatch: [
    ...baseConfig.testMatch,
    '<rootDir>/e2e-detox/**/*.test.android.ts',
  ],
};
