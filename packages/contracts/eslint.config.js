// @ts-check
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  {
    ignores: ['node_modules/**', 'dist/**', 'coverage/**', 'eslint.config.js'],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  }
);
