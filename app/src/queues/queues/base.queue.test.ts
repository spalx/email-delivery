import { QueueOptions } from 'bullmq';

import { Queue as FakeQueue } from '../../../test/mocks/bullmq';
import { BaseQueue } from './base.queue';

class TestQueue extends BaseQueue {
  constructor(options?: Partial<QueueOptions>) {
    super('TestQueue', options);
  }
}

function builtQueue(queue: BaseQueue): FakeQueue {
  return queue.queue as unknown as FakeQueue;
}

describe('BaseQueue - initialize', () => {
  it('should build one queue with the Bull connection and remove finished jobs', () => {
    // Arrange
    const queue = new TestQueue();
    const before = FakeQueue.instances.length;

    // Act
    queue.initialize();

    // Assert
    expect(FakeQueue.instances).toHaveLength(before + 1);
    expect(builtQueue(queue).name).toBe('TestQueue');
    expect(builtQueue(queue).opts).toEqual({
      connection: { host: 'bull-db.invalid', port: 6379 },
      defaultJobOptions: { removeOnComplete: true, removeOnFail: true },
    });
  });

  it('should apply the subclass options over the defaults', () => {
    const queue = new TestQueue({ defaultJobOptions: { attempts: 3 }, prefix: 'mail' });

    queue.initialize();

    expect(builtQueue(queue).opts).toEqual({
      connection: { host: 'bull-db.invalid', port: 6379 },
      defaultJobOptions: { attempts: 3 },
      prefix: 'mail',
    });
  });

  it('should build nothing on a second call', () => {
    const queue = new TestQueue();
    queue.initialize();
    const first = queue.queue;
    const before = FakeQueue.instances.length;

    queue.initialize();

    expect(FakeQueue.instances).toHaveLength(before);
    expect(queue.queue).toBe(first);
  });
});

describe('BaseQueue - queue', () => {
  it('should throw before the queue is initialised', () => {
    expect(() => new TestQueue().queue).toThrow('Queue "TestQueue" has not been initialized yet.');
  });
});

describe('BaseQueue - add', () => {
  it('should add the job to the queue with its options and return the result', async () => {
    // Arrange
    const queue = new TestQueue();
    queue.initialize();
    const job = { id: 'job-1' };
    builtQueue(queue).add.mockResolvedValueOnce(job);

    // Act
    const result = await queue.add('SendEmail', { to: ['a@example.test'] }, { jobId: 'job-1', priority: 1 });

    // Assert
    expect(result).toBe(job);
    expect(builtQueue(queue).add.mock.calls).toEqual([
      ['SendEmail', { to: ['a@example.test'] }, { jobId: 'job-1', priority: 1 }],
    ]);
  });

  it('should reject before the queue is initialised', async () => {
    await expect(new TestQueue().add('SendEmail', {})).rejects.toThrow(
      'Queue "TestQueue" has not been initialized yet.'
    );
  });
});

describe('BaseQueue - upsertJobScheduler', () => {
  it('should pass the scheduler to the queue and return the result', async () => {
    const queue = new TestQueue();
    queue.initialize();
    const template = { name: 'Digest', data: { day: 'monday' } };

    await queue.upsertJobScheduler('weekly-digest', { pattern: '0 9 * * 1' }, template);

    expect(builtQueue(queue).upsertJobScheduler.mock.calls).toEqual([
      ['weekly-digest', { pattern: '0 9 * * 1' }, template],
    ]);
  });
});
