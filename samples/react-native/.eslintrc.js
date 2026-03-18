module.exports = {
  root: true,
  extends: '@react-native',
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      rules: {
        '@typescript-eslint/no-shadow': ['error'],
        // In @typescript-eslint v8, caughtErrors defaults to 'all' (was 'none' in v5).
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
        'no-shadow': 'off',
        'no-undef': 'off',
        quotes: [2, 'single', { avoidEscape: true }],
      },
    },
  ],
};
