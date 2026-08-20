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
            'packages/contracts/jest.config.ts',
            'packages/esim-rules/jest.config.ts',
            'packages/ui-tokens/jest.config.ts',
            'packages/signals-collector/jest.config.ts',
            'apps/web/jest.config.ts',
            'apps/widget/jest.config.ts',
            'tools/eval/jest.config.ts',
            'tools/seed/jest.config.ts',
          ],
          // Список выше превысил встроенный лимит (8) — агент 4 добавил девятый файл
          // (tools/seed/jest.config.ts), этап 6.1 добавил четыре файла тестового окружения
          // интерфейса (packages/ui-tokens, packages/signals-collector, apps/web, apps/widget) —
          // итого 13. `apps/widget/vite.config.ts` (этап 6.3) сюда НЕ добавлен: он входит в
          // `include` `apps/widget/tsconfig.json` напрямую (тот же приём, что `apps/web/
          // vite.config.ts` уже применял) — присутствие в обоих местах одновременно конфликтует
          // (`projectService` требует объявления ровно в одном). Список файлов конечен и не растёт
          // с объёмом кода приложения (по одному конфигурационному файлу на пакет/приложение/
          // инструмент), поэтому предупреждение о производительности линтинга не применимо.
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 13,
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
    files: ['**/*.spec.ts', '**/*.spec.tsx', '**/*.e2e-spec.ts', '**/test/**/*.ts'],
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
