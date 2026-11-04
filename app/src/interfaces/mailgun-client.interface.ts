export interface MailgunSendOptions {
  trackClicks?: boolean;
  variables?: Record<string, string>;
}

export interface MailgunClient {
  sendEmail(
    from: string,
    to: string[],
    subject: string,
    body: string,
    attachments?: Record<string, Blob>,
    inline?: Record<string, Blob>,
    cc?: string[],
    bcc?: string[],
    replyTo?: string,
    options?: MailgunSendOptions
  ): Promise<void>;
}
