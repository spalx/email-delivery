import { SendEmailDTO } from 'email-delivery-pkg';

import EmailProviderStrategy from './email-provider.strategy';
import mailgunApiService from '@services/email-provider/mailgun-api.service';
import { InternalServerError } from '@common/errors';

class MailgunStrategy extends EmailProviderStrategy {
  async sendEmail(data: SendEmailDTO): Promise<void> {
    await mailgunApiService.sendEmail(
      data.from,
      data.to,
      data.subject,
      data.body,
      data.attachments ?? {},
      data.inline ?? {},
      data.cc ?? [],
      data.bcc ?? [],
      data.replyTo ?? ''
    );
  }
}

export default new MailgunStrategy();
