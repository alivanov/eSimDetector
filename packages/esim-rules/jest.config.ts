import type { Config } from 'jest';

const config: Config = {
  displayName: 'esim-rules',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  // '@esim-detector/contracts' резолвится через tsconfig "paths" для tsc, но Jest их не
  // читает — образец сопоставления взят из packages/fuzzy-matcher/jest.config.ts.
  moduleNameMapper: {
    '^@esim-detector/contracts$': '<rootDir>/../contracts/src/index.ts',
  },
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
