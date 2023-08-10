module.exports = {
  root: true,
  env: {
    node: true,
    'react-native/react-native': true,
  },
  extends: ['@sentry-internal/sdk'],
  plugins: ['@sentry-internal/sdk'],
  parserOptions: {
    project: './tsconfig.json',
  },
  settings: {
    version: 'detect', // React version. "detect" automatically picks the version you have installed.
  },
  ignorePatterns: ['test/react-native/versions/**/*', 'coverage/**/*', 'test/typescript/**/*'],
  overrides: [
    {
      // Typescript Files
      files: ['*.ts', '*.tsx'],
      extends: ['plugin:react/recommended'],
      plugins: ['react', 'react-native'],
      rules: {
        '@typescript-eslint/typedef': ['error', { arrowParameter: false, variableDeclarationIgnoreFunction: true }],
      },
    },
    {
      // Test Files
      files: ['*.test.ts', '*.test.tsx', '*.test.js', '*.test.jsx'],
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/no-empty-function': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/unbound-method': 'off',
      },
    },
    {
      // Scripts
      files: ['scripts/*'],
      parserOptions: {
        ecmaVersion: 2015,
      },
      rules: {
        'no-console': 'off',
      },
    },
    {
      // RN Versions Test Tools
      files: ['test/react-native/*'],
      parserOptions: {
        ecmaVersion: 2017,
      },
    },
  ],
  rules: {
    // Bundle size isn't too much of an issue for React Native.
    '@sentry-internal/sdk/no-async-await': 'off',
    '@sentry-internal/sdk/no-optional-chaining': 'off',
    '@sentry-internal/sdk/no-nullish-coalescing': 'off',
    '@sentry-internal/sdk/no-unsupported-es6-methods': 'off',
    '@sentry-internal/sdk/no-class-field-initializers': 'off',
  },
};
