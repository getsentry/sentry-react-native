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
  overrides: [
    {
      // Typescript Files
      files: ['*.ts', '*.tsx'],
      extends: ['plugin:react/recommended'],
      plugins: ['react', 'react-native'],
      rules: {
        '@typescript-eslint/typedef': [
          'error',
          { arrowParameter: false, variableDeclarationIgnoreFunction: true },
        ],
      },
    },
    {
      // Test Files
      files: ['*.test.ts', '*.test.tsx', '*.test.js', '*.test.jsx'],
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/no-empty-function': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
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
  ],
  rules: {
    // Bundle size isn't too much of an issue for React Native.
    '@sentry-internal/sdk/no-async-await': 'off',
  },
};
