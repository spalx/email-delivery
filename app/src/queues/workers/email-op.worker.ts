import { Worker, Job } from 'bullmq';
import { CorrelatedRequestDTO } from 'transport-pkg';
import { SendEmailDTO } from 'email-delivery-pkg';
import { logger } from 'common-loggers-pkg';

import { bullDbConnection } from '@/config/db.config';
import { QUEUE_EMAIL_OP, EmailOpJobName } from '@/common/constants';
import emailController from '@/controllers/email.controller';

const jobHandlers: Record<string, (data: CorrelatedRequestDTO<SendEmailDTO>) => Promise<void>> = {
  [EmailOpJobName.SendEmail]: emailController.sendEmail.bind(emailController),
};

const emailOpWorker = new Worker(
  QUEUE_EMAIL_OP,
  async (job: Job) => {
    const handler = jobHandlers[job.name];
    if (handler) {
      await handler(job.data);
    } else {
      logger.error(`No handler found for email job: ${job.name}`);
    }
  },
  {
    connection: bullDbConnection,
    concurrency: 4,
  }
);

emailOpWorker.on('failed', (job?: Job, error?: Error) => {
  logger.error(`Email job ${job?.name} with data ${JSON.stringify(job?.data)} failed:`, error);
});

export default emailOpWorker;
