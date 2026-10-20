import { logger } from '@spalx/common-loggers-pkg';

import fakeMailgunApiService from './fake-mailgun-api.service';

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function send(to: string[], subject = 'Invoice', extra: { cc?: string[]; bcc?: string[] } = {}): Promise<void> {
  return fakeMailgunApiService.sendEmail(
    'billing@example.test',
    to,
    subject,
    '<p>Hi</p>',
    {},
    {},
    extra.cc ?? [],
    extra.bcc ?? []
  );
}

describe('FakeMailgunApiService', () => {
  beforeEach(() => {
    fakeMailgunApiService.reset();
  });

  describe('should_accept_and_record_an_email_without_reaching_mailgun', () => {
    it('should resolve without any network request', async () => {
      await send(['a@example.test']);

      expect(fetch).not.toHaveBeenCalled();
    });

    it('should record the sender, every recipient list, reply-to, subject, body, file metadata and time', async () => {
      // Arrange
      const attachments = { 'invoice.pdf': new Blob(['x'.repeat(2048)], { type: 'application/pdf' }) };
      const inline = { 'logo.png': new Blob(['PNG'], { type: 'image/png' }) };
      jest.useFakeTimers({ now: new Date('2026-10-20T10:00:00.000Z'), doNotFake: ['nextTick', 'setImmediate'] });

      try {
        // Act
        await fakeMailgunApiService.sendEmail(
          'noreply@example.test',
          ['user@example.test'],
          'Reset your password',
          '<a href="https://example.test/reset/abc">Reset</a>',
          attachments,
          inline,
          ['audit@example.test'],
          ['bcc@example.test'],
          'support@example.test'
        );
      } finally {
        jest.useRealTimers();
      }

      // Assert
      expect(fakeMailgunApiService.getOutbox()).toEqual([
        {
          id: expect.stringMatching(ID_PATTERN),
          from: 'noreply@example.test',
          to: ['user@example.test'],
          cc: ['audit@example.test'],
          bcc: ['bcc@example.test'],
          reply_to: 'support@example.test',
          subject: 'Reset your password',
          body: '<a href="https://example.test/reset/abc">Reset</a>',
          attachments: [{ filename: 'invoice.pdf', size: 2048, content_type: 'application/pdf' }],
          inline: [{ filename: 'logo.png', size: 3, content_type: 'image/png' }],
          sent_at: '2026-10-20T10:00:00.000Z',
        },
      ]);
    });

    it('should record no reply-to, copies or files when none are given', async () => {
      await fakeMailgunApiService.sendEmail('billing@example.test', ['a@example.test'], 'Invoice', '<p>Hi</p>');

      expect(fakeMailgunApiService.getOutbox()[0]).toMatchObject({
        cc: [],
        bcc: [],
        reply_to: null,
        attachments: [],
        inline: [],
      });
    });

    it('should log each send with its id and recipients', async () => {
      await send(['a@example.test', 'b@example.test']);

      const [email] = fakeMailgunApiService.getOutbox();
      expect(jest.mocked(logger.info).mock.calls).toEqual([
        [`[FAKE PROVIDERS] Mailgun send ${email.id} to a@example.test, b@example.test`],
      ]);
    });

    it('should reject a file that is not a Blob, as the real client does, and record nothing', async () => {
      await expect(
        fakeMailgunApiService.sendEmail('billing@example.test', ['a@example.test'], 'Invoice', '<p>Hi</p>', {
          'invoice.pdf': {} as Blob,
        })
      ).rejects.toThrow('to be an instance of Blob');
      expect(fakeMailgunApiService.getOutbox()).toEqual([]);
    });
  });

  describe('should_read_the_outbox_oldest_first_and_by_recipient', () => {
    beforeEach(async () => {
      await send(['a@example.test'], 'one');
      await send(['b@example.test'], 'two', { cc: ['audit@example.test'] });
      await send(['c@example.test'], 'three', { bcc: ['a@example.test'] });
    });

    it('should list every email, oldest first', () => {
      expect(fakeMailgunApiService.getOutbox().map((email) => email.subject)).toEqual(['one', 'two', 'three']);
    });

    it('should match the address in to, cc or bcc', () => {
      expect(fakeMailgunApiService.getOutbox('a@example.test').map((email) => email.subject)).toEqual(['one', 'three']);
      expect(fakeMailgunApiService.getOutbox('audit@example.test').map((email) => email.subject)).toEqual(['two']);
    });

    it('should match the address ignoring case, and only whole addresses', () => {
      expect(fakeMailgunApiService.getOutbox('A@Example.TEST').map((email) => email.subject)).toEqual(['one', 'three']);
      expect(fakeMailgunApiService.getOutbox('example.test')).toEqual([]);
    });

    it('should hand out copies, so a caller cannot change the outbox', () => {
      const [email] = fakeMailgunApiService.getOutbox();
      email.subject = 'changed';
      email.to.push('x@example.test');
      email.attachments.push({ filename: 'x', size: 1, content_type: '' });

      expect(fakeMailgunApiService.getOutbox()[0]).toMatchObject({
        subject: 'one',
        to: ['a@example.test'],
        attachments: [],
      });
    });

    it('should keep its own copy of the recipient lists', async () => {
      const to = ['d@example.test'];
      await send(to, 'four');
      to.push('x@example.test');

      expect(fakeMailgunApiService.getOutbox('d@example.test')[0].to).toEqual(['d@example.test']);
    });
  });

  describe('should_keep_only_the_latest_1000_emails', () => {
    it('should drop the oldest email once 1,000 are recorded', async () => {
      // Arrange
      for (let i = 1; i <= 1000; i++) {
        await send(['a@example.test'], `email ${i}`);
      }

      // Act
      await send(['a@example.test'], 'email 1001');

      // Assert
      const outbox = fakeMailgunApiService.getOutbox();
      expect(outbox).toHaveLength(1000);
      expect(outbox[0].subject).toBe('email 2');
      expect(outbox[999].subject).toBe('email 1001');
    });
  });

  describe('should_fail_the_next_send_as_mailgun_rejects_one', () => {
    it('should reject the next send with the description and record nothing', async () => {
      // Arrange
      fakeMailgunApiService.failNextSend('Blocked');

      // Act / Assert
      await expect(send(['a@example.test'])).rejects.toThrow('Mailgun API error: 400 - {"message":"Blocked"}');
      expect(fakeMailgunApiService.getOutbox()).toEqual([]);
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should reject with Simulated failure when no description is given', async () => {
      fakeMailgunApiService.failNextSend();

      await expect(send(['a@example.test'])).rejects.toThrow(
        'Mailgun API error: 400 - {"message":"Simulated failure"}'
      );
    });

    it('should fail one send only', async () => {
      fakeMailgunApiService.failNextSend();
      await expect(send(['a@example.test'], 'one')).rejects.toThrow();

      await send(['a@example.test'], 'two');

      expect(fakeMailgunApiService.getOutbox().map((email) => email.subject)).toEqual(['two']);
    });

    it('should use the latest description when called twice before a send', async () => {
      fakeMailgunApiService.failNextSend('First');
      fakeMailgunApiService.failNextSend('Second');

      await expect(send(['a@example.test'])).rejects.toThrow('{"message":"Second"}');
      await expect(send(['a@example.test'])).resolves.toBeUndefined();
    });
  });

  describe('should_start_over_on_reset', () => {
    it('should empty the outbox and cancel a pending failure', async () => {
      // Arrange
      await send(['a@example.test'], 'one');
      fakeMailgunApiService.failNextSend();

      // Act
      fakeMailgunApiService.reset();

      // Assert
      expect(fakeMailgunApiService.getOutbox()).toEqual([]);
      await send(['a@example.test'], 'two');
      expect(fakeMailgunApiService.getOutbox().map((email) => email.subject)).toEqual(['two']);
    });
  });
});
