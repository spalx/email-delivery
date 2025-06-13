import { Queue } from 'bullmq';

import { bullDbConnection } from '@config/db.config';
import { QUEUE_EMAIL_OP } from '@common/constants';

const emailOpQueue = new Queue(QUEUE_EMAIL_OP, {
  connection: bullDbConnection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: true,
  },
});

export default emailOpQueue;
