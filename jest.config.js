module.exports = {
  collectCoverage: true,
  preset: 'react-native',
  setupFilesAfterEnv: ['jest-extended/all', '<rootDir>/test/mockConsole.ts'],
  globals: {
    __DEV__: true,
    'ts-jest': {
      tsConfig: './tsconfig.json',
      diagnostics: false,
    },
  },
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  testPathIgnorePatterns: ['<rootDir>/test/e2e/', '<rootDir>/test/tools/', '<rootDir>/test/react-native/versions'],
  testEnvironment: 'node',
  testMatch: ['**/*.test.(ts|tsx)'],
};
