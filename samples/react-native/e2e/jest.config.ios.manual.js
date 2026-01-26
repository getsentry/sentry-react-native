const baseConfig = require('./jest.config.base');
const path = require('path');

/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  ...baseConfig,
  testMatch: [
    ...baseConfig.testMatch,
    '<rootDir>/e2e/**/*.test.ios.ts',
    '<rootDir>/e2e/**/*.test.ios.manual.ts',
  ],
  globalSetup: path.resolve(__dirname, 'setup.ios.ts'),
  testTimeout: 300000,
};
