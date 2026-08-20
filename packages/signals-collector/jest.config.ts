import type { Config } from 'jest';

const config: Config = {
  displayName: 'signals-collector',
  // Без jsdom намеренно: алгоритм принимает источник сигналов параметром (SignalsSource),
  // тесты используют поддельные реализации, а не настоящий браузерный DOM (docs/03 §3.2,
  // .cursor/rules/pure-packages.mdc — пакет остаётся чистым и не тянет глобальные объекты).
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  // isolatedModules задан в tsconfig.json пакета (наследуется из tsconfig.base.json),
  // а не здесь: с ts-jest v30 опция в transform устарела.
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts'],
  coverageThreshold: {
    global: {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
  },
};

export default config;
