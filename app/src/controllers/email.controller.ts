import { SendEmailDTO, DidSendEmailDTO } from 'email-delivery-pkg';
import { transportService, CorrelatedRequestDTO, CorrelatedRequestDTOSchema } from 'transport-pkg';
import { logger } from 'common-loggers-pkg';

import { SendEmailDTOSchema } from '@/common/constants';
import emailService from '@/services/email/email.service';

class EmailController {
  async sendEmail(dto: CorrelatedRequestDTO<SendEmailDTO>): Promise<void> {
    let error: unknown | null = null;
    let responseData: DidSendEmailDTO | {} = {};

    try {
      CorrelatedRequestDTOSchema.parse(dto);
      SendEmailDTOSchema.parse(dto.data);

      responseData = await emailService.sendEmail(dto.data);
    } catch (err) {
      logger.error(`Failed to send email to ${dto.data.to}`, err);
      error = err;
    } finally {
      this.sendResponseForRequest(dto, responseData, error);
    }
  }

  private sendResponseForRequest(req: CorrelatedRequestDTO, responseData: object, error: unknown | null) {
    const { action, data, correlation_id, request_id, transport_name } = req;

    const responseRequest: CorrelatedRequestDTO = {
      correlation_id,
      request_id,
      action,
      transport_name,
      data: responseData,
    };

    transportService.sendResponse(responseRequest, error);
  }
}

export default new EmailController();
