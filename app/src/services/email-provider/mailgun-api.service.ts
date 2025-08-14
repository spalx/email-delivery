import appConfig from '@/config/app.config';

class MailgunApiService {
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

    const headers = {
      Authorization:
        'Basic ' + Buffer.from(`${appConfig.mailgun.username}:${appConfig.mailgun.key}`).toString('base64'),
    };

    const response = await fetch(`${appConfig.mailgun.url}/messages`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Mailgun API error: ${response.status} - ${errorText}`);
    }
  }
}

export default new MailgunApiService();
