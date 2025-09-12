import { SendEmailDTO, DidSendEmailDTO } from 'email-delivery-pkg';

import strategyRegistry from '@/strategies/index';
import { EmailProvider } from '@/common/constants';
import EmailProviderStrategy from '@/strategies/email-provider/email-provider.strategy';

class EmailService {
  async sendEmail(data: SendEmailDTO): Promise<DidSendEmailDTO> {
    const emailProviderStrategy: EmailProviderStrategy = strategyRegistry.getStrategy(
      EmailProvider.Mailgun
    ) as EmailProviderStrategy;

    await emailProviderStrategy.sendEmail(data);

    return {
      // We don't want to send the full request data, because body can be too big
      from: data.from,
      to: data.to,
      subject: data.subject,
    };
  }
}

export default new EmailService();
