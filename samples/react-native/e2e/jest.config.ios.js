const path = require('path');
const baseConfig = require('./jest.config.base');

/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  ...baseConfig,
  globalSetup: path.resolve(__dirname, 'setup.ios.ts'),
};
