module.exports = {
  collectCoverage: true,
  preset: '@react-native/jest-preset',
  setupFilesAfterEnv: ['jest-extended/all', '<rootDir>/test/mockConsole.ts'],
  globals: {
    __DEV__: true,
  },
  transform: {
    '^.+\\.jsx$': 'babel-jest',
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
      },
    ],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  // As of v10.58.0 the JS SDK packages expose a `react-native` export condition that points at
  // their ESM build. The `react-native` Jest preset's test environment sets
  // `customExportConditions = ['require', 'react-native']`, so Jest resolves that condition and
  // loads untransformed ESM (including transitive subpaths like `@sentry/core/browser`), failing
  // with "Unexpected token 'export'". Use a test environment that drops the `react-native`
  // condition so these packages resolve to their CJS builds, as they did before the condition.
  testEnvironment: '<rootDir>/test/RNTestEnvironment.js',
  testPathIgnorePatterns: ['<rootDir>/test/e2e/', '<rootDir>/test/tools/', '<rootDir>/test/react-native/versions'],
  testMatch: ['**/*.test.(ts|tsx)'],
};
