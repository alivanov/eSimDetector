import type { Config } from 'jest';

const config: Config = {
  displayName: 'api',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/test/**/*.e2e-spec.ts'],
  globalSetup: '<rootDir>/../../packages/test-utils/src/globalSetup.ts',
  globalTeardown: '<rootDir>/../../packages/test-utils/src/globalTeardown.ts',
  moduleNameMapper: {
    '^@esim-detector/test-utils$': '<rootDir>/../../packages/test-utils/src/index.ts',
  },
  // isolatedModules задан в tsconfig.json пакета (наследуется из tsconfig.base.json),
  // а не здесь: с ts-jest v30 опция в transform устарела.
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
};

export default config;
