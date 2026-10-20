import { Queue } from 'bullmq';

import bullDbConnection from '@/config/bull.config';

// Used only for its Redis client.
const redisAccess = new Queue('integration-test-reset', { connection: bullDbConnection });

// Every test starts from an empty Redis, so no test sees jobs or keys another one left.
beforeEach(async () => {
  const client = await redisAccess.client;
  let cursor = '0';
  do {
    const [next, keys] = await client.scan(cursor, { COUNT: 1000 });
    if (keys.length > 0) {
      await client.del(...keys);
    }
    cursor = next;
  } while (cursor !== '0');
});

afterAll(async () => {
  await redisAccess.close();
});
