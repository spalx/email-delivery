export default async function stopTestRedis(): Promise<void> {
  await globalThis.__REDIS_CONTAINER__?.stop();
}
