import strategyRegistry from './strategy-registry';
import mailgunStrategy from './email-provider/mailgun.strategy';
import { EmailProvider } from '@/common/constants';

strategyRegistry.registerStrategy(EmailProvider.Mailgun, mailgunStrategy);

export default strategyRegistry;
