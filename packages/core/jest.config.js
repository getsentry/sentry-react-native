module.exports = {
  collectCoverage: true,
  preset: 'react-native',
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
  testPathIgnorePatterns: ['<rootDir>/test/e2e/', '<rootDir>/test/tools/', '<rootDir>/test/react-native/versions'],
  testMatch: ['**/*.test.(ts|tsx)'],
};
