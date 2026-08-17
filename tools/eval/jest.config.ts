import type { Config } from 'jest';

const config: Config = {
  displayName: 'tools-eval',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  // '@esim-detector/*' резолвятся через tsconfig "paths" для tsc, но Jest их не читает —
  // образец сопоставления взят из apps/api/jest.config.ts и packages/fuzzy-matcher/jest.config.ts.
  moduleNameMapper: {
    '^@esim-detector/text-normalizer$': '<rootDir>/../../packages/text-normalizer/src/index.ts',
    '^@esim-detector/fuzzy-matcher$': '<rootDir>/../../packages/fuzzy-matcher/src/index.ts',
  },
  // isolatedModules задан в tsconfig.json пакета (наследуется из tsconfig.base.json),
  // а не здесь: с ts-jest v30 опция в transform устарела.
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
};

export default config;
