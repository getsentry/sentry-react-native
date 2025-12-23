module.exports = {
  root: true,
  extends: ['expo', '@react-native'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  settings: {
    'import/resolver': {
      typescript: {
        project: ['tsconfig.json'],
      },
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
      },
    },
  },
  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      rules: {
        '@typescript-eslint/no-shadow': ['error'],
        'no-shadow': 'off',
        'no-undef': 'off',
        quotes: [2, 'single', { avoidEscape: true }],
        // Disable deprecated rules removed in @typescript-eslint v8
        '@typescript-eslint/func-call-spacing': 'off',
        '@typescript-eslint/ban-types': 'off',
        // Disable import/no-unresolved for workspace packages that may not be built yet
        'import/no-unresolved': ['error', { ignore: ['^@sentry/'] }],
      },
    },
  ],
  ignorePatterns: ['/node_modules', '/ios', '/android', '/.expo'],
};
