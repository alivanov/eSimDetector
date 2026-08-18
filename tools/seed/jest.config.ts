import type { Config } from 'jest';

const config: Config = {
  displayName: 'tools-seed',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  // Интеграционные тесты MongoDB (idempotентность `mongo/load.ts`) требуют изолированный
  // сервер `mongodb-memory-server`, поднимаемый один раз на весь прогон (ADR-017,
  // docs/08-testing-and-quality.md §8.5) — тот же образец, что apps/api/jest.config.ts.
  globalSetup: '<rootDir>/../../packages/test-utils/src/globalSetup.ts',
  globalTeardown: '<rootDir>/../../packages/test-utils/src/globalTeardown.ts',
  // '@esim-detector/*' резолвятся через tsconfig "paths" для tsc, но Jest их не читает —
  // образец сопоставления взят из apps/api/jest.config.ts.
  moduleNameMapper: {
    '^@esim-detector/test-utils$': '<rootDir>/../../packages/test-utils/src/index.ts',
    '^@esim-detector/contracts$': '<rootDir>/../../packages/contracts/src/index.ts',
    '^@esim-detector/text-normalizer$': '<rootDir>/../../packages/text-normalizer/src/index.ts',
    '^@esim-detector/esim-rules$': '<rootDir>/../../packages/esim-rules/src/index.ts',
  },
  // isolatedModules задан в tsconfig.json пакета (наследуется из tsconfig.base.json),
  // а не здесь: с ts-jest v30 опция в transform устарела.
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/cli.ts'],
  coverageThreshold: {
    global: {
      statements: 90,
      branches: 90,
      functions: 90,
      lines: 90,
    },
  },
};

export default config;
