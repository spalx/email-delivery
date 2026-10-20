import { EmailDeliveryAction, EmailFile, MAX_EMAIL_FILES_BYTES, SendEmailDTO } from '@spalx/email-delivery-pkg';
import {
  CorrelatedMessage,
  ErrorCorrelatedMessage,
  TransportAdapterName,
  transportService,
} from '@spalx/transport-pkg';
import { logger } from '@spalx/common-loggers-pkg';

import emailService from '@/services/email/email.service';
import emailController from './email.controller';

jest.mock('@/services/email/email.service', () => ({
  __esModule: true,
  default: { sendEmail: jest.fn() },
}));

const CORRELATION_ID = 'c0ffee00-0000-4000-8000-000000000001';

function buildEmail(overrides: Partial<SendEmailDTO> = {}): SendEmailDTO {
  return {
    from: 'billing@example.test',
    to: ['a@example.test'],
    subject: 'Invoice',
    body: '<p>Hi</p>',
    ...overrides,
  };
}

function file(bytes: number, contentType = 'application/octet-stream'): EmailFile {
  return { content_base64: Buffer.alloc(bytes).toString('base64'), content_type: contentType };
}

function buildRequest(data: SendEmailDTO): CorrelatedMessage<SendEmailDTO> {
  return CorrelatedMessage.create(CORRELATION_ID, EmailDeliveryAction.SendEmail, TransportAdapterName.HTTP, data);
}

function broadcastMessages(): CorrelatedMessage[] {
  return jest.mocked(transportService.broadcast).mock.calls.map(([message]) => message);
}

describe('EmailController - sendEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(transportService, 'broadcast').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('should_send_and_broadcast_the_reply_when_the_email_is_valid', () => {
    it('should send the email and broadcast DidSendEmail with the reply', async () => {
      // Arrange
      const email = buildEmail();
      const reply = { from: email.from, to: email.to, subject: email.subject };
      jest.mocked(emailService.sendEmail).mockResolvedValueOnce(reply);

      // Act
      await emailController.sendEmail(buildRequest(email));

      // Assert
      expect(jest.mocked(emailService.sendEmail).mock.calls).toEqual([[email]]);
      const messages = broadcastMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].isError()).toBe(false);
      expect(messages[0]).toMatchObject({
        correlation_id: CORRELATION_ID,
        action: EmailDeliveryAction.DidSendEmail,
        transport: TransportAdapterName.Kafka,
        data: reply,
      });
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe('should_broadcast_an_error_without_failing_when_the_email_is_invalid', () => {
    it('should not send it, and should log and broadcast a 400 with the schema messages', async () => {
      // Arrange
      const email = buildEmail({ from: '', to: [] });

      // Act
      await expect(emailController.sendEmail(buildRequest(email))).resolves.toBeUndefined();

      // Assert
      expect(emailService.sendEmail).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ name: 'ZodError' }));
      const [message] = broadcastMessages();
      expect(message.isError()).toBe(true);
      expect(message).toMatchObject({
        correlation_id: CORRELATION_ID,
        action: EmailDeliveryAction.DidSendEmail,
        transport: TransportAdapterName.Kafka,
        code: 400,
        message: 'from cannot be empty, to must not be empty',
        data: {},
      });
    });
  });

  describe('should_send_an_email_with_files_when_they_are_valid', () => {
    it('should send base64 attachments and inline files up to 10 MB in total', async () => {
      // Arrange
      jest.mocked(emailService.sendEmail).mockResolvedValueOnce({ from: 'x', to: ['y'], subject: 'z' });
      const email = buildEmail({
        attachments: { 'invoice.pdf': file(MAX_EMAIL_FILES_BYTES - 3) },
        inline: { 'logo.png': file(3, 'image/png') },
      });

      // Act
      await emailController.sendEmail(buildRequest(email));

      // Assert
      expect(jest.mocked(emailService.sendEmail).mock.calls).toEqual([[email]]);
      expect(broadcastMessages()[0].isError()).toBe(false);
    });
  });

  describe('should_reject_files_that_cannot_be_sent', () => {
    it.each([
      [
        'files over 10 MB in total',
        { attachments: { 'a.bin': file(MAX_EMAIL_FILES_BYTES - 3) }, inline: { 'b.png': file(4) } },
        'attachments and inline files must total at most 10 MB',
      ],
      [
        'content that is not base64',
        { attachments: { 'a.pdf': { content_base64: 'not base64!', content_type: 'application/pdf' } } },
        'each attachments content_base64 must be valid base64',
      ],
      [
        'empty content',
        { inline: { 'a.png': { content_base64: '', content_type: 'image/png' } } },
        'each inline content_base64 cannot be empty',
      ],
      [
        'an empty content type',
        { attachments: { 'a.pdf': { content_base64: 'QQ==', content_type: '' } } },
        'each attachments content_type cannot be empty',
      ],
      [
        'an empty file name',
        { inline: { '': { content_base64: 'QQ==', content_type: 'image/png' } } },
        'inline file names cannot be empty',
      ],
      // How a Blob sent by a 1.x caller arrives: it does not survive JSON.
      [
        'a Blob from a 1.x caller',
        { attachments: { 'invoice.pdf': {} } },
        'each attachments content_base64 must be valid base64, each attachments content_type must be a string',
      ],
    ])('should not send an email with %s, and should broadcast a 400 saying why', async (_case, files, reason) => {
      // Arrange
      const email = { ...buildEmail(), ...files } as SendEmailDTO;

      // Act
      await expect(emailController.sendEmail(buildRequest(email))).resolves.toBeUndefined();

      // Assert
      expect(emailService.sendEmail).not.toHaveBeenCalled();
      expect(broadcastMessages()[0]).toMatchObject({
        correlation_id: CORRELATION_ID,
        action: EmailDeliveryAction.DidSendEmail,
        code: 400,
        message: reason,
      });
    });
  });

  describe('should_broadcast_an_error_without_failing_when_mailgun_fails', () => {
    it('should log and broadcast a 500 with the Mailgun message', async () => {
      // Arrange
      const error = new Error('Mailgun API error: 401 - Forbidden');
      jest.mocked(emailService.sendEmail).mockRejectedValueOnce(error);

      // Act
      await expect(emailController.sendEmail(buildRequest(buildEmail()))).resolves.toBeUndefined();

      // Assert
      expect(jest.mocked(logger.error).mock.calls).toEqual([[expect.any(String), error]]);
      const [message] = broadcastMessages();
      expect(message).toBeInstanceOf(ErrorCorrelatedMessage);
      expect(message).toMatchObject({
        correlation_id: CORRELATION_ID,
        code: 500,
        message: 'Mailgun API error: 401 - Forbidden',
      });
    });
  });

  describe('should_use_the_configured_transport_when_it_broadcasts', () => {
    it('should broadcast on the transport set in the config, not the one the request came on', async () => {
      jest.mocked(emailService.sendEmail).mockResolvedValueOnce({ from: 'x', to: ['y'], subject: 'z' });

      await emailController.sendEmail(buildRequest(buildEmail()));

      expect(broadcastMessages()[0].transport).toBe(TransportAdapterName.Kafka);
    });
  });

  describe('should_fail_when_the_broadcast_fails', () => {
    it('should reject with the broadcast error after a successful send', async () => {
      const error = new Error('Kafka producer is disconnected');
      jest.mocked(emailService.sendEmail).mockResolvedValueOnce({ from: 'x', to: ['y'], subject: 'z' });
      jest.mocked(transportService.broadcast).mockRejectedValueOnce(error);

      await expect(emailController.sendEmail(buildRequest(buildEmail()))).rejects.toBe(error);
    });
  });
});
