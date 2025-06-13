import { SendEmailDTO } from 'email-delivery-pkg';

import BaseStrategy from '@strategies/base.strategy';

abstract class EmailProviderStrategy extends BaseStrategy {
  abstract sendEmail(data: SendEmailDTO): Promise<void>;
}

export default EmailProviderStrategy;
