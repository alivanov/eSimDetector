import type { Config } from 'jest';

const config: Config = {
  displayName: 'test-utils',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  globalSetup: '<rootDir>/src/globalSetup.ts',
  globalTeardown: '<rootDir>/src/globalTeardown.ts',
  // isolatedModules задан в tsconfig.json пакета (наследуется из tsconfig.base.json),
  // а не здесь: с ts-jest v30 опция в transform устарела.
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
};

export default config;
