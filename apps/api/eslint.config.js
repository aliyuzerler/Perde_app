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
      // NESTJS NOTU: consistent-type-imports, dekoratörlü constructor
      // parametrelerindeki importları "tip-only" sayıp `import type`a
      // çevirmeye zorluyor; ancak emitDecoratorMetadata ile NestJS DI bu
      // importların çalışma anında DEĞER olmasını gerektirir. Kuralın
      // dekoratör farkındalığı typescript-eslint 8'de kaldırıldığı için bu
      // pakette kural kapalıdır (contracts/mobile katı kalır).
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  }
);
