import { SendEmailDTO } from 'email-delivery-pkg';
import { CorrelatedRequestDTO } from 'transport-pkg';

import BaseCommand from '@/commands/base.command';
import emailOpQueue from '@/queues/queues/email-op.queue';
import { EmailOpJobName, QueueJobPriority } from '@/common/constants';

export default class SendEmailCommand extends BaseCommand {
  async execute(requestData: CorrelatedRequestDTO<SendEmailDTO>): Promise<void> {
    await emailOpQueue.add(EmailOpJobName.SendEmail, requestData, {
      jobId: requestData.request_id,
      priority: QueueJobPriority.Critical,
    });
  }
}
