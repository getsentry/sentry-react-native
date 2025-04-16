var globals = require('@jest/globals');
var jest = globals.jest;

module.exports = {
  transform: jest.fn(),
  getCacheKey: jest.fn(),
};
