import { SendEmailDTO } from '@spalx/email-delivery-pkg';

import { isFakeProviders } from '@/common/env';
import mailgunApiService from '@/services/email-provider/mailgun-api.service';
import fakeMailgunApiService from '@/services/email-provider/fake-mailgun-api.service';
import mailgunStrategy from './mailgun.strategy';

jest.mock('@/services/email-provider/mailgun-api.service', () => ({
  __esModule: true,
  default: { sendEmail: jest.fn() },
}));

jest.mock('@/services/email-provider/fake-mailgun-api.service', () => ({
  __esModule: true,
  default: { sendEmail: jest.fn() },
}));

jest.mock('@/common/env', () => ({
  isFakeProviders: jest.fn(),
}));

function buildEmail(overrides: Partial<SendEmailDTO> = {}): SendEmailDTO {
  return {
    from: 'billing@example.test',
    to: ['a@example.test'],
    subject: 'Invoice',
    body: '<p>Hi</p>',
    ...overrides,
  };
}

async function describeBlobs(
  files: Record<string, Blob> = {}
): Promise<Record<string, { type: string; text: string }>> {
  const entries = await Promise.all(
    Object.entries(files).map(async ([name, blob]) => [name, { type: blob.type, text: await blob.text() }] as const)
  );
  return Object.fromEntries(entries);
}

describe('MailgunStrategy - sendEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(isFakeProviders).mockReturnValue(false);
  });

  it('should pass every field to the Mailgun API service in order', async () => {
    // Arrange
    const email = buildEmail({
      cc: ['cc@example.test'],
      bcc: ['bcc@example.test'],
      replyTo: 'support@example.test',
    });

    // Act
    await mailgunStrategy.sendEmail(email);

    // Assert
    expect(jest.mocked(mailgunApiService.sendEmail).mock.calls).toEqual([
      [
        'billing@example.test',
        ['a@example.test'],
        'Invoice',
        '<p>Hi</p>',
        {},
        {},
        ['cc@example.test'],
        ['bcc@example.test'],
        'support@example.test',
      ],
    ]);
  });

  it('should decode each base64 file into a Blob of its content type, keeping its name', async () => {
    // Arrange
    const email = buildEmail({
      attachments: {
        'invoice.pdf': { content_base64: Buffer.from('%PDF-1.7').toString('base64'), content_type: 'application/pdf' },
        'terms.txt': { content_base64: Buffer.from('terms').toString('base64'), content_type: 'text/plain' },
      },
      inline: { 'logo.png': { content_base64: Buffer.from('PNG').toString('base64'), content_type: 'image/png' } },
    });

    // Act
    await mailgunStrategy.sendEmail(email);

    // Assert
    const [[, , , , attachments, inline]] = jest.mocked(mailgunApiService.sendEmail).mock.calls;
    expect(await describeBlobs(attachments)).toEqual({
      'invoice.pdf': { type: 'application/pdf', text: '%PDF-1.7' },
      'terms.txt': { type: 'text/plain', text: 'terms' },
    });
    expect(await describeBlobs(inline)).toEqual({ 'logo.png': { type: 'image/png', text: 'PNG' } });
  });

  it('should fill in empty files, copies and reply-to when the email has none', async () => {
    await mailgunStrategy.sendEmail(buildEmail());

    expect(jest.mocked(mailgunApiService.sendEmail).mock.calls).toEqual([
      ['billing@example.test', ['a@example.test'], 'Invoice', '<p>Hi</p>', {}, {}, [], [], ''],
    ]);
  });

  it('should pass a Mailgun error through', async () => {
    const error = new Error('Mailgun API error: 401 - Forbidden');
    jest.mocked(mailgunApiService.sendEmail).mockRejectedValueOnce(error);

    await expect(mailgunStrategy.sendEmail(buildEmail())).rejects.toBe(error);
  });

  describe('should_send_through_the_fake_when_the_providers_are_fake', () => {
    it('should pass every field to the fake and not to Mailgun', async () => {
      // Arrange
      jest.mocked(isFakeProviders).mockReturnValue(true);

      // Act
      await mailgunStrategy.sendEmail(
        buildEmail({
          replyTo: 'support@example.test',
          attachments: {
            'a.pdf': { content_base64: Buffer.from('A').toString('base64'), content_type: 'application/pdf' },
          },
        })
      );

      // Assert
      expect(jest.mocked(fakeMailgunApiService.sendEmail).mock.calls).toEqual([
        [
          'billing@example.test',
          ['a@example.test'],
          'Invoice',
          '<p>Hi</p>',
          { 'a.pdf': expect.any(Blob) },
          {},
          [],
          [],
          'support@example.test',
        ],
      ]);
      expect(mailgunApiService.sendEmail).not.toHaveBeenCalled();
    });

    it('should pass a fake failure through', async () => {
      jest.mocked(isFakeProviders).mockReturnValue(true);
      const error = new Error('Mailgun API error: 400 - {"message":"Simulated failure"}');
      jest.mocked(fakeMailgunApiService.sendEmail).mockRejectedValueOnce(error);

      await expect(mailgunStrategy.sendEmail(buildEmail())).rejects.toBe(error);
    });
  });
});
