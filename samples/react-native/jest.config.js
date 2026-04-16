/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  preset: '@react-native/jest-preset',
  testMatch: [
    '<rootDir>/__tests__/**/*-test.ts',
    '<rootDir>/__tests__/**/*-test.tsx',
  ],
};
