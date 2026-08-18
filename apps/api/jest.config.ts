import type { Config } from 'jest';

const config: Config = {
  displayName: 'api',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/test/**/*.e2e-spec.ts'],
  globalSetup: '<rootDir>/../../packages/test-utils/src/globalSetup.ts',
  globalTeardown: '<rootDir>/../../packages/test-utils/src/globalTeardown.ts',
  // Аналогов у собранных `dist/` пакетов нет в чистом клоне без шага `pnpm build` — образец
  // сопоставления взят из packages/fuzzy-matcher/jest.config.ts.
  moduleNameMapper: {
    '^@esim-detector/test-utils$': '<rootDir>/../../packages/test-utils/src/index.ts',
    '^@esim-detector/contracts$': '<rootDir>/../../packages/contracts/src/index.ts',
    '^@esim-detector/fuzzy-matcher$': '<rootDir>/../../packages/fuzzy-matcher/src/index.ts',
    '^@esim-detector/text-normalizer$': '<rootDir>/../../packages/text-normalizer/src/index.ts',
  },
  // isolatedModules задан в tsconfig.json пакета (наследуется из tsconfig.base.json),
  // а не здесь: с ts-jest v30 опция в transform устарела.
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
};

export default config;
