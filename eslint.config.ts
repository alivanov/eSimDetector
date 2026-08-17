import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/*.tsbuildinfo',
      'reports/**',
      'data/catalog/**',
      'data/fixtures/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Конфигурационные скрипты (eslint.config.ts, jest.config.ts пакетов) намеренно
        // не входят ни в один tsconfig.json приложения — они не участвуют в сборке.
        // Типы для них берутся из отдельного tsconfig.eslint.json.
        projectService: {
          allowDefaultProject: [
            'eslint.config.ts',
            'apps/api/jest.config.ts',
            'packages/test-utils/jest.config.ts',
            'packages/text-normalizer/jest.config.ts',
            'packages/fuzzy-matcher/jest.config.ts',
          ],
          defaultProject: 'tsconfig.eslint.json',
        },
        tsconfigRootDir: process.cwd(),
      },
    },
    rules: {
      // ADR-016: внешние данные не приводятся к типу утверждением `as`, а проходят
      // валидацию схемой. `as const` разрешён — он не ослабляет типизацию.
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      // ADR-016: `any` создаёт видимость типобезопасности при её отсутствии.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/restrict-template-expressions': 'off',
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', '**/test/**/*.ts'],
    rules: {
      // В тестах допустимы прямые обращения к приватным деталям реализации.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      // Запрет `as` в ADR-016 обоснован недоверенными внешними данными
      // (сигналы браузера, пользовательский ввод, CSV). Тестовые дублёры
      // фреймворковых интерфейсов — не внешние данные, а контролируемые
      // фикстуры, поэтому здесь утверждение типа допустимо.
      '@typescript-eslint/consistent-type-assertions': 'off',
    },
  },
  {
    files: ['**/*.config.ts', 'tools/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  eslintConfigPrettier,
);
