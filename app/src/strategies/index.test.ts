import { EmailProvider } from '@/common/constants';
import mailgunStrategy from './email-provider/mailgun.strategy';
import strategyRegistry from './index';

describe('strategies - index', () => {
  it('should register the Mailgun strategy under mailgun', () => {
    expect(strategyRegistry.getStrategy(EmailProvider.Mailgun)).toBe(mailgunStrategy);
    expect(EmailProvider.Mailgun).toBe('mailgun');
  });
});
