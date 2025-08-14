import { SendEmailDTO, DidSendEmailDTO } from 'email-delivery-pkg';
import { transportService, CorrelatedRequestDTO, CorrelatedRequestDTOSchema } from 'transport-pkg';
import { logger } from 'common-loggers-pkg';

import strategyRegistry from '@/strategies/index';
import { EmailProvider, SendEmailDTOSchema } from '@/common/constants';
import EmailProviderStrategy from '@/strategies/email-provider/email-provider.strategy';

class EmailService {
  async sendEmail(requestData: CorrelatedRequestDTO<SendEmailDTO>): Promise<void> {
    const { action, data, correlation_id, request_id, transport_name } = requestData;

    let error: unknown | null = null;

    try {
      CorrelatedRequestDTOSchema.parse(requestData);
      SendEmailDTOSchema.parse(data);

      const emailProviderStrategy: EmailProviderStrategy = strategyRegistry.getStrategy(
        EmailProvider.Mailgun
      ) as EmailProviderStrategy;

      await emailProviderStrategy.sendEmail(data);
    } catch (err) {
      logger.error(`Failed to send email to ${data.to}`, err);
      error = err;
    } finally {
      const responseRequest: CorrelatedRequestDTO<DidSendEmailDTO> = {
        correlation_id,
        request_id,
        action,
        transport_name,
        data: {
          // We don't want to send the full request data, because body can be too big
          to: data.to,
          subject: data.subject,
        },
      };

      transportService.sendResponse(responseRequest, error);
    }
  }
}

export default new EmailService();
