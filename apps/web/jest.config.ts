import type { Config } from 'jest';

/**
 * Браузерное тестовое окружение для будущих компонентов (docs/13-branding.md, этап 6.2 и далее):
 * Jest + jsdom + Testing Library — второй прогонщик тестов (vitest) в проект не заводится
 * (AGENTS.md, репозиторий стоит на Jest). Компонентов и тестов на них в объёме этого агента нет
 * (docs/11 §11.2а, этап 6.1: основание, а не экран) — `passWithNoTests` не даёт пустому набору
 * тестов уронить общий `pnpm test`.
 */
const config: Config = {
  displayName: 'web',
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/src/**/*.spec.tsx', '<rootDir>/src/**/*.spec.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  passWithNoTests: true,
  // CSS-модули (`*.module.css`) в jsdom не обрабатываются сборщиком — тестам достаточно того,
  // что импорт возвращает объект строк-классов, а не реальных стилей (identity-obj-proxy).
  moduleNameMapper: {
    '\\.module\\.css$': 'identity-obj-proxy',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        // apps/web собирается Vite и использует "module": "ESNext" (docs/09 ADR-016) — Jest без
        // ESM-режима ожидает от ts-jest вывод в CommonJS, поэтому переопределяем только это поле.
        tsconfig: { module: 'commonjs' },
      },
    ],
  },
  collectCoverage: false,
};

export default config;
