import { randomUUID } from 'crypto';
import { logger } from '@spalx/common-loggers-pkg';

import { MailgunApiService } from './mailgun-api.service';

export interface OutboxFile {
  filename: string;
  size: number;
  content_type: string;
}

export interface OutboxEmail {
  id: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  reply_to: string | null;
  subject: string;
  body: string;
  attachments: OutboxFile[];
  inline: OutboxFile[];
  sent_at: string;
}

const OUTBOX_LIMIT = 1000;
const DEFAULT_FAILURE = 'Simulated failure';

function describeFiles(files: Record<string, Blob>): OutboxFile[] {
  return Object.entries(files).map(([filename, file]) => ({ filename, size: file.size, content_type: file.type }));
}

function copyEmail(email: OutboxEmail): OutboxEmail {
  return {
    ...email,
    to: [...email.to],
    cc: [...email.cc],
    bcc: [...email.bcc],
    attachments: email.attachments.map((file) => ({ ...file })),
    inline: email.inline.map((file) => ({ ...file })),
  };
}

// Used in place of Mailgun when PROVIDERS=fake. Only the network call is replaced: it answers with Mailgun's reply,
// and every accepted email is kept in an in-memory outbox that the test endpoints read. File contents are not kept.
export class FakeMailgunApiService extends MailgunApiService {
  private outbox: OutboxEmail[] = [];
  private pendingFailure: string | null = null;

  override async sendEmail(
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
    await super.sendEmail(from, to, subject, body, attachments, inline, cc, bcc, replyTo);

    const email: OutboxEmail = {
      id: randomUUID(),
      from,
      to: [...to],
      cc: [...cc],
      bcc: [...bcc],
      reply_to: replyTo || null,
      subject,
      body,
      attachments: describeFiles(attachments),
      inline: describeFiles(inline),
      sent_at: new Date().toISOString(),
    };
    this.outbox.push(email);
    if (this.outbox.length > OUTBOX_LIMIT) {
      this.outbox.shift();
    }

    logger.info(`[FAKE PROVIDERS] Mailgun send ${email.id} to ${to.join(', ')}`);
  }

  getOutbox(to?: string): OutboxEmail[] {
    const address = to?.toLowerCase();
    return this.outbox
      .filter(
        (email) =>
          address === undefined ||
          [...email.to, ...email.cc, ...email.bcc].some((recipient) => recipient.toLowerCase() === address)
      )
      .map(copyEmail);
  }

  failNextSend(description: string = DEFAULT_FAILURE): void {
    this.pendingFailure = description;
  }

  reset(): void {
    this.outbox = [];
    this.pendingFailure = null;
  }

  protected override async post(): Promise<Response> {
    const failure = this.pendingFailure;
    this.pendingFailure = null;

    // Mailgun answers a rejected message with 400 and a JSON message; the real reply check turns it into an error.
    if (failure !== null) {
      return new Response(JSON.stringify({ message: failure }), { status: 400 });
    }
    return new Response(
      JSON.stringify({ id: `<${randomUUID()}@fake-mailgun.invalid>`, message: 'Queued. Thank you.' }),
      {
        status: 200,
      }
    );
  }
}

export default new FakeMailgunApiService();
