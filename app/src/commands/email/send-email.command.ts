import { SendEmailDTO } from 'email-delivery-pkg';
import { CorrelatedMessage } from 'transport-pkg';

import BaseCommand from '@/commands/base.command';
import emailOpQueue from '@/queues/queues/email-op.queue';
import { EmailOpJobName, QueueJobPriority } from '@/common/constants';

export default class SendEmailCommand extends BaseCommand {
  async execute(req: CorrelatedMessage<SendEmailDTO>): Promise<void> {
    await emailOpQueue.add(EmailOpJobName.SendEmail, req, {
      jobId: req.id,
      priority: QueueJobPriority.Critical,
    });
  }
}
