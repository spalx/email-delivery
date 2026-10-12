import { Job } from 'bullmq';
import { CorrelatedMessage } from '@spalx/transport-pkg';
import { SendEmailDTO } from '@spalx/email-delivery-pkg';
import { BaseWorker } from './base.worker';
import { QUEUE_EMAIL_OP, EmailOpJobName } from '@/common/constants';
import emailController from '@/controllers/email.controller';

const jobHandlers: Record<string, (job: Job) => Promise<void>> = {
  [EmailOpJobName.SendEmail]: async (job: Job) => {
    const data = job.data as CorrelatedMessage<SendEmailDTO>;
    await emailController.sendEmail(data);
  },
};

class EmailOpWorker extends BaseWorker {
  constructor() {
    super(QUEUE_EMAIL_OP, jobHandlers, { concurrency: 4 });
  }
}

const emailOpWorker = new EmailOpWorker();
export default emailOpWorker;
