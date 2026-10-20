import { EmailFile, SendEmailDTO } from '@spalx/email-delivery-pkg';

import EmailProviderStrategy from './email-provider.strategy';
import mailgunApiService from '@/services/email-provider/mailgun-api.service';
import fakeMailgunApiService from '@/services/email-provider/fake-mailgun-api.service';
import { isFakeProviders } from '@/common/env';
import { MailgunClient } from '@/interfaces/mailgun-client.interface';

function toBlobs(files: Record<string, EmailFile> = {}): Record<string, Blob> {
  return Object.fromEntries(
    Object.entries(files).map(([name, file]) => [
      name,
      new Blob([Buffer.from(file.content_base64, 'base64')], { type: file.content_type }),
    ])
  );
}

class MailgunStrategy extends EmailProviderStrategy {
  async sendEmail(data: SendEmailDTO): Promise<void> {
    const client: MailgunClient = isFakeProviders() ? fakeMailgunApiService : mailgunApiService;
    await client.sendEmail(
      data.from,
      data.to,
      data.subject,
      data.body,
      toBlobs(data.attachments),
      toBlobs(data.inline),
      data.cc ?? [],
      data.bcc ?? [],
      data.replyTo ?? ''
    );
  }
}

export default new MailgunStrategy();
