import { EmailDeliveryAction, SendEmailDTO } from '@spalx/email-delivery-pkg';
import { CorrelatedMessage, TransportAdapterName } from '@spalx/transport-pkg';

import emailOpQueue from '@/queues/queues/email-op.queue';
import SendEmailCommand from './send-email.command';

jest.mock('@/queues/queues/email-op.queue', () => ({
  __esModule: true,
  default: { add: jest.fn() },
}));

function buildRequest(): CorrelatedMessage<SendEmailDTO> {
  return CorrelatedMessage.create(
    'c0ffee00-0000-4000-8000-000000000001',
    EmailDeliveryAction.SendEmail,
    TransportAdapterName.HTTP,
    { from: 'billing@example.test', to: ['a@example.test'], subject: 'Invoice', body: '<p>Hi</p>' }
  );
}

describe('SendEmailCommand - execute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should queue the whole request as a SendEmail job under its id at critical priority', async () => {
    // Arrange
    const req = buildRequest();

    // Act
    await new SendEmailCommand().execute(req);

    // Assert
    expect(jest.mocked(emailOpQueue.add).mock.calls).toEqual([['SendEmail', req, { jobId: req.id, priority: 1 }]]);
  });

  it('should resolve with nothing', async () => {
    await expect(new SendEmailCommand().execute(buildRequest())).resolves.toBeUndefined();
  });

  it('should pass a queue error through', async () => {
    const error = new Error('Queue "EmailOp" has not been initialized yet.');
    jest.mocked(emailOpQueue.add).mockRejectedValueOnce(error);

    await expect(new SendEmailCommand().execute(buildRequest())).rejects.toBe(error);
  });
});
