import type { Config } from 'jest';

/**
 * Браузерное тестовое окружение для будущего Web Component (docs/07-integration.md, этап 6.3):
 * Jest + jsdom + Testing Library, второй прогонщик тестов не заводится (AGENTS.md). Самого
 * компонента и тестов на него в объёме этого агента нет (docs/11 §11.2а, этап 6.1: основание, а
 * не сборка виджета) — `passWithNoTests` не даёт пустому набору тестов уронить общий `pnpm test`.
 */
const config: Config = {
  displayName: 'widget',
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/src/**/*.spec.tsx', '<rootDir>/src/**/*.spec.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  passWithNoTests: true,
  moduleNameMapper: {
    '\\.module\\.css$': 'identity-obj-proxy',
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
  collectCoverage: false,
};

export default config;
