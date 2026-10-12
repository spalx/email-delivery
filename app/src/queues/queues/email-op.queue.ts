import { BaseQueue } from '@/queues/queues/base.queue';
import { QUEUE_EMAIL_OP } from '@/common/constants';

class EmailOpQueue extends BaseQueue {
  constructor() {
    super(QUEUE_EMAIL_OP);
  }
}

const emailOpQueue = new EmailOpQueue();
export default emailOpQueue;
