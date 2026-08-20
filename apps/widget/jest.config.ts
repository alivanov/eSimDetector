import type { Config } from 'jest';

/**
 * Браузерное тестовое окружение для компонентов интерфейса (docs/13-branding.md, этап 6.2):
 * Jest + jsdom + Testing Library, второй прогонщик тестов не заводится (AGENTS.md).
 * `apps/widget/src` — единственный исходник компонентов для `apps/web` и будущего Web Component
 * (ADR-038, ADR-039), поэтому здесь и живут тесты компонентов, а не в `apps/web`.
 */
const config: Config = {
  displayName: 'widget',
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/src/**/*.spec.tsx', '<rootDir>/src/**/*.spec.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  passWithNoTests: true,
  moduleNameMapper: {
    '\\.module\\.css$': 'identity-obj-proxy',
    '^@esim-detector/ui-tokens$': '<rootDir>/../../packages/ui-tokens/src/index.ts',
    '^@esim-detector/signals-collector$': '<rootDir>/../../packages/signals-collector/src/index.ts',
    // Существует только внутри `vite build` (`vite-plugin-css-injected-by-js`, ADR-040) — см.
    // комментарий в файле дублёра.
    '^virtual:css-injected-by-js$':
      '<rootDir>/src/web-component/test-utils/virtual-css-injected-by-js-mock.ts',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        // apps/widget собирается бандлером и использует "module": "ESNext" — Jest без ESM-режима
        // ожидает от ts-jest вывод в CommonJS, переопределяем только это поле.
        tsconfig: { module: 'commonjs' },
      },
    ],
  },
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.spec.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/test-utils/**',
    '!src/web-component/test-utils/**',
    // Барреллы — только реэкспорт без собственной логики, покрытие каждого отдельного
    // экспорта уже проверено тестами модулей, на которые они ссылаются.
    '!src/index.ts',
    '!src/api/index.ts',
    '!src/web-component/index.ts',
  ],
  // Целевой порог docs/08-testing-and-quality.md §8.2, строка «UI-компоненты»: «≥ 80%».
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
  },
};

export default config;
