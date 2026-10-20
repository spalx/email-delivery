import { SendEmailDTO } from '@spalx/email-delivery-pkg';

import mailgunStrategy from '@/strategies/email-provider/mailgun.strategy';
import emailService from './email.service';

jest.mock('@/strategies/email-provider/mailgun.strategy', () => ({
  __esModule: true,
  default: { sendEmail: jest.fn() },
}));

function buildEmail(overrides: Partial<SendEmailDTO> = {}): SendEmailDTO {
  return {
    from: 'billing@example.test',
    to: ['a@example.test', 'b@example.test'],
    subject: 'Invoice',
    body: '<p>A long body</p>',
    ...overrides,
  };
}

describe('EmailService - sendEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should send the email through the Mailgun strategy', async () => {
    // Arrange
    const email = buildEmail();

    // Act
    await emailService.sendEmail(email);

    // Assert
    expect(jest.mocked(mailgunStrategy.sendEmail).mock.calls).toEqual([[email]]);
  });

  it('should reply with the sender, recipients and subject but not the body', async () => {
    const result = await emailService.sendEmail(
      buildEmail({ cc: ['cc@example.test'], replyTo: 'support@example.test' })
    );

    expect(result).toEqual({
      from: 'billing@example.test',
      to: ['a@example.test', 'b@example.test'],
      subject: 'Invoice',
    });
  });

  it('should pass a strategy error through without a reply', async () => {
    const error = new Error('Mailgun API error: 500 - ');
    jest.mocked(mailgunStrategy.sendEmail).mockRejectedValueOnce(error);

    await expect(emailService.sendEmail(buildEmail())).rejects.toBe(error);
  });
});
