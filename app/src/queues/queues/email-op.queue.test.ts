import { Queue as FakeQueue } from '../../../test/mocks/bullmq';
import emailOpQueue from './email-op.queue';

describe('EmailOpQueue - initialize', () => {
  it('should build the EmailOp queue with the default job options', () => {
    // Act
    emailOpQueue.initialize();

    // Assert
    const built = emailOpQueue.queue as unknown as FakeQueue;
    expect(built.name).toBe('EmailOp');
    expect(built.opts).toEqual({
      connection: { host: 'bull-db.invalid', port: 6379 },
      defaultJobOptions: { removeOnComplete: true, removeOnFail: true },
    });
  });
});
