import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';

// A fixed major version, so every run tests against the same Redis.
const REDIS_IMAGE = 'redis:8';

declare global {
  var __REDIS_CONTAINER__: StartedRedisContainer | undefined;
}

export default async function startTestRedis(): Promise<void> {
  let container: StartedRedisContainer;
  try {
    container = await new RedisContainer(REDIS_IMAGE).start();
  } catch (error) {
    throw new Error(`Could not start the integration test Redis (${REDIS_IMAGE}). Is Docker running?`, {
      cause: error,
    });
  }

  globalThis.__REDIS_CONTAINER__ = container;

  // Jest workers inherit these, and test/setup/env.ts keeps values already set.
  process.env.BULL_DB_HOST = container.getHost();
  process.env.BULL_DB_PORT = String(container.getPort());
}
