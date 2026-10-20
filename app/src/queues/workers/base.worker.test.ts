import { Job, WorkerOptions } from 'bullmq';
import { logger } from '@spalx/common-loggers-pkg';

import { Worker as FakeWorker } from '../../../test/mocks/bullmq';
import { BaseWorker } from './base.worker';

type JobHandler = (job: Job) => Promise<void>;
type FailedListener = (job?: Partial<Job>, error?: Error) => void;

class TestWorker extends BaseWorker {
  constructor(handlers: Record<string, JobHandler> = {}, options?: Partial<WorkerOptions>) {
    super('TestQueue', handlers, options);
  }
}

// Initialises the worker and returns the fake BullMQ worker it built.
function start(worker: BaseWorker): FakeWorker {
  const before = FakeWorker.instances.length;
  worker.initialize();
  expect(FakeWorker.instances).toHaveLength(before + 1);
  return FakeWorker.instances[before];
}

function failedListener(built: FakeWorker): FailedListener {
  const call = built.on.mock.calls.find(([event]) => event === 'failed');
  if (!call) {
    throw new Error('No failed listener registered');
  }
  return call[1] as FailedListener;
}

function buildJob(name: string): Job {
  return { name, id: 'job-1', data: { to: ['a@example.test'] } } as Job;
}

describe('BaseWorker - initialize', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should build one worker for the queue with the Bull connection and the subclass options', () => {
    // Act
    const built = start(new TestWorker({}, { concurrency: 2 }));

    // Assert
    expect(built.name).toBe('TestQueue');
    expect(built.opts).toEqual({ connection: { host: 'bull-db.invalid', port: 6379 }, concurrency: 2 });
  });

  it('should build nothing on a second call', () => {
    const worker = new TestWorker();
    start(worker);
    const before = FakeWorker.instances.length;

    worker.initialize();

    expect(FakeWorker.instances).toHaveLength(before);
  });

  it('should log a failed job with its name, id and error message', () => {
    const listener = failedListener(start(new TestWorker()));

    listener(buildJob('SendEmail'), new Error('Mailgun API error: 500 - '));

    expect(jest.mocked(logger.error).mock.calls).toEqual([
      ['Worker [TestQueue] - Job SendEmail with ID job-1 failed: Mailgun API error: 500 - '],
    ]);
  });

  it('should log a failure that comes without a job or an error', () => {
    const listener = failedListener(start(new TestWorker()));

    listener(undefined, undefined);

    expect(jest.mocked(logger.error).mock.calls).toEqual([
      ['Worker [TestQueue] - Job undefined with ID undefined failed: Unknown error'],
    ]);
  });
});

describe('BaseWorker - processJob', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should run the handler registered for the job name', async () => {
    // Arrange
    const handler = jest.fn<Promise<void>, [Job]>().mockResolvedValue(undefined);
    const built = start(new TestWorker({ SendEmail: handler }));
    const job = buildJob('SendEmail');

    // Act
    await built.processor(job);

    // Assert
    expect(handler.mock.calls).toEqual([[job]]);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('should log a job with no handler and not fail', async () => {
    const built = start(new TestWorker({ SendEmail: jest.fn() }));

    await expect(built.processor(buildJob('SendSms'))).resolves.toBeUndefined();

    expect(jest.mocked(logger.error).mock.calls).toEqual([['No handler found for job: SendSms in queue: TestQueue']]);
  });

  it('should fail the job when its handler fails', async () => {
    const error = new Error('Kafka producer is disconnected');
    const built = start(new TestWorker({ SendEmail: jest.fn().mockRejectedValue(error) }));

    await expect(built.processor(buildJob('SendEmail'))).rejects.toBe(error);
  });
});

describe('BaseWorker - close', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should close the worker it built', async () => {
    // Arrange
    const worker = new TestWorker();
    const built = start(worker);

    // Act
    await worker.close();

    // Assert
    expect(built.close).toHaveBeenCalledTimes(1);
    expect(jest.mocked(logger.info).mock.calls).toEqual([['Shutting down worker for queue: TestQueue']]);
  });

  it('should do nothing when no worker was built', async () => {
    await expect(new TestWorker().close()).resolves.toBeUndefined();

    expect(logger.info).not.toHaveBeenCalled();
  });
});
