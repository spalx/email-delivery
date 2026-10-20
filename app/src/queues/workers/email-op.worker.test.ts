import { Job } from 'bullmq';
import { logger } from '@spalx/common-loggers-pkg';

import emailController from '@/controllers/email.controller';
import { Worker as FakeWorker } from '../../../test/mocks/bullmq';
import emailOpWorker from './email-op.worker';

jest.mock('@/controllers/email.controller', () => ({
  __esModule: true,
  default: { sendEmail: jest.fn() },
}));

describe('EmailOpWorker', () => {
  let built: FakeWorker;

  beforeAll(() => {
    const before = FakeWorker.instances.length;
    emailOpWorker.initialize();
    built = FakeWorker.instances[before];
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should work the EmailOp queue four jobs at a time', () => {
    expect(built.name).toBe('EmailOp');
    expect(built.opts).toEqual({ connection: { host: 'bull-db.invalid', port: 6379 }, concurrency: 4 });
  });

  it('should hand a SendEmail job data to the controller', async () => {
    // Arrange
    const data = { correlation_id: 'c0ffee00', data: { to: ['a@example.test'] } };

    // Act
    await built.processor({ name: 'SendEmail', id: 'job-1', data } as Job);

    // Assert
    expect(jest.mocked(emailController.sendEmail).mock.calls).toEqual([[data]]);
  });

  it('should fail the job when the controller fails', async () => {
    const error = new Error('Kafka producer is disconnected');
    jest.mocked(emailController.sendEmail).mockRejectedValueOnce(error);

    await expect(built.processor({ name: 'SendEmail', id: 'job-1', data: {} } as Job)).rejects.toBe(error);
  });

  it('should log a job it has no handler for', async () => {
    await built.processor({ name: 'SendSms', id: 'job-2', data: {} } as Job);

    expect(emailController.sendEmail).not.toHaveBeenCalled();
    expect(jest.mocked(logger.error).mock.calls).toEqual([['No handler found for job: SendSms in queue: EmailOp']]);
  });
});
