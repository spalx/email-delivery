import { SendEmailDTO, SendEmailDTOSchema, DidSendEmailDTO, EmailDeliveryAction } from 'email-delivery-pkg';
import { CorrelatedMessage, TransportAdapterName, transportService } from 'transport-pkg';
import { logger } from 'common-loggers-pkg';

import appConfig from '@/config/app.config';
import emailService from '@/services/email/email.service';

class EmailController {
  async sendEmail(req: CorrelatedMessage<SendEmailDTO>): Promise<void> {
    let error: unknown | undefined;
    let responseData: DidSendEmailDTO | undefined;

    try {
      SendEmailDTOSchema.parse(req.data);

      responseData = await emailService.sendEmail(req.data);
    } catch (err) {
      logger.error(`Failed to send email to ${req.data.to}`, err);
      error = err;
    } finally {
      const transportName: TransportAdapterName = appConfig.transport.for_broadcast as TransportAdapterName;

      const response: CorrelatedMessage = CorrelatedMessage.create(
        req.correlation_id,
        EmailDeliveryAction.DidSendEmail,
        transportName,
        responseData,
        error
      );

      await transportService.broadcast(response);
    }
  }
}

export default new EmailController();
