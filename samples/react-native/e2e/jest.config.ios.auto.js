const baseConfig = require('./jest.config.base');

/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  ...baseConfig,
  testMatch: [
    ...baseConfig.testMatch,
    '<rootDir>/e2e/**/*.test.ios.ts',
    '<rootDir>/e2e/**/*.test.ios.auto.ts',
  ],
};
