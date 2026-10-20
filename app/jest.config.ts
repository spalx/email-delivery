import type { Config } from 'jest';

// Modules held to the coverage threshold. A module is added in the same change that adds its tests.
const COVERED_MODULES = [
  'src/app.ts',
  'src/config/app.config.ts',
  'src/config/bull.config.ts',
  'src/services/email-provider/mailgun-api.service.ts',
  'src/services/email-provider/fake-mailgun-api.service.ts',
  'src/controllers/fake-providers.controller.ts',
  'src/fake-providers/fake-providers.server.ts',
  'src/common/env.ts',
  'src/strategies/email-provider/mailgun.strategy.ts',
  'src/strategies/strategy-registry.ts',
  'src/strategies/index.ts',
  'src/services/email/email.service.ts',
  'src/controllers/email.controller.ts',
  'src/commands/email/send-email.command.ts',
  'src/queues/queues/base.queue.ts',
  'src/queues/queues/email-op.queue.ts',
  'src/queues/workers/base.worker.ts',
  'src/queues/workers/email-op.worker.ts',
];

// Compiles each file on its own, as tsc would emit it, without type-checking (pnpm typecheck does that).
// Not SWC: its CommonJS exports break the decorator metadata of entities that import each other.
const tsTransform: Config['transform'] = {
  '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }],
};

const SRC_ALIAS = { '^@/(.*)$': '<rootDir>/src/$1' };

const config: Config = {
  collectCoverageFrom: COVERED_MODULES,
  coverageDirectory: '<rootDir>/coverage',
  coverageThreshold: {
    global: { branches: 90, functions: 90, lines: 90, statements: 90 },
  },
  projects: [
    {
      displayName: 'unit',
      roots: ['<rootDir>/src'],
      testMatch: ['**/*.test.ts'],
      testEnvironment: 'node',
      transform: tsTransform,
      moduleNameMapper: {
        '^bullmq$': '<rootDir>/test/mocks/bullmq.ts',
        '^@spalx/common-loggers-pkg$': '<rootDir>/test/mocks/common-loggers.ts',
        ...SRC_ALIAS,
      },
      setupFiles: ['<rootDir>/test/setup/env.ts', '<rootDir>/test/setup/no-network.ts'],
      clearMocks: true,
    },
    {
      displayName: 'integration',
      roots: ['<rootDir>/test/integration'],
      testMatch: ['**/*.int.test.ts'],
      testEnvironment: 'node',
      transform: tsTransform,
      // bullmq is not mapped: integration tests use the real queue against the Redis the global setup starts.
      moduleNameMapper: {
        '^@spalx/common-loggers-pkg$': '<rootDir>/test/mocks/common-loggers.ts',
        ...SRC_ALIAS,
      },
      globalSetup: '<rootDir>/test/setup/integration-global-setup.ts',
      globalTeardown: '<rootDir>/test/setup/integration-global-teardown.ts',
      setupFiles: ['<rootDir>/test/setup/env.ts', '<rootDir>/test/setup/no-network.ts'],
      setupFilesAfterEnv: ['<rootDir>/test/setup/integration.ts'],
      clearMocks: true,
    },
  ],
};

export default config;
