module.exports = {
  root: true,
  extends: ['expo', '@react-native'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
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
      },
    },
  ],
  ignorePatterns: ['/node_modules', '/ios', '/android', '/.expo'],
};
