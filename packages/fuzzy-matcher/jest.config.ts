import type { Config } from 'jest';

const config: Config = {
  displayName: 'fuzzy-matcher',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  // '@esim-detector/text-normalizer' резолвится через tsconfig "paths" для tsc,
  // но Jest их не читает — образец сопоставления взят из apps/api/jest.config.ts.
  moduleNameMapper: {
    '^@esim-detector/text-normalizer$': '<rootDir>/../text-normalizer/src/index.ts',
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
      statements: 95,
      branches: 95,
      functions: 95,
      lines: 95,
    },
  },
};

export default config;
