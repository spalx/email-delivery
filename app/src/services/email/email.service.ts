import { SendEmailDTO, EmailDeliveryKafkaTopic } from 'email-delivery-pkg';
import { CorrelatedRequestDTO, CorrelatedKafkaResponse } from 'kafka-pkg';
import { logger } from 'common-loggers-pkg';

import strategyRegistry from '@strategies/index';
import { EmailProvider } from '@common/constants';
import EmailProviderStrategy from '@strategies/email-provider/email-provider.strategy';

class EmailService {
  async sendEmail(requestData: CorrelatedRequestDTO<SendEmailDTO>): Promise<void> {
    const { data, correlation_id, request_id } = requestData;

    let error: unknown | null = null;

    try {
      const emailProviderStrategy: EmailProviderStrategy = strategyRegistry.getStrategy(
        EmailProvider.Mailgun
      ) as EmailProviderStrategy;

      await emailProviderStrategy.sendEmail(data);
    } catch (err) {
      logger.error(`Failed to send email to ${data.to}`, err);
      error = err;
    } finally {
      const responseRequest: CorrelatedRequestDTO = {
        correlation_id,
        request_id,
        data: {
          to: data.to,
          subject: data.subject,
        }
      };

      const response = new CorrelatedKafkaResponse(EmailDeliveryKafkaTopic.SendEmail);
      response.send(responseRequest, error);
    }
  }
}

export default new EmailService();
