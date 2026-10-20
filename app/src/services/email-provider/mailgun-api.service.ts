import appConfig from '@/config/app.config';
import { MailgunClient } from '@/interfaces/mailgun-client.interface';

export class MailgunApiService implements MailgunClient {
  async sendEmail(
    from: string,
    to: string[],
    subject: string,
    body: string,
    attachments: Record<string, Blob> = {},
    inline: Record<string, Blob> = {},
    cc: string[] = [],
    bcc: string[] = [],
    replyTo = ''
  ): Promise<void> {
    const formData = new FormData();
    formData.append('from', from);
    formData.append('to', to.join(','));
    if (cc.length) {
      formData.append('cc', cc.join(','));
    }
    if (bcc.length) {
      formData.append('bcc', bcc.join(','));
    }
    if (replyTo) {
      formData.append('h:Reply-To', replyTo);
    }
    formData.append('subject', subject);
    formData.append('html', body);

    for (const attachmentName in attachments) {
      formData.append('attachment', attachments[attachmentName], attachmentName);
    }

    for (const attachmentName in inline) {
      formData.append('inline', inline[attachmentName], attachmentName);
    }

    const response = await this.post(formData);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Mailgun API error: ${response.status} - ${errorText}`);
    }
  }

  // The only network call, so the fake replaces just this and the form building and reply check still run.
  protected async post(form: FormData): Promise<Response> {
    const headers = {
      Authorization:
        'Basic ' + Buffer.from(`${appConfig.mailgun.username}:${appConfig.mailgun.key}`).toString('base64'),
    };

    return fetch(`${appConfig.mailgun.url}/messages`, {
      method: 'POST',
      headers,
      body: form,
    });
  }
}

export default new MailgunApiService();
