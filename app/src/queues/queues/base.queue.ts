import { JobsOptions, Queue, QueueOptions, RepeatOptions } from 'bullmq';
import bullDbConnection from '@/config/bull.config';

export abstract class BaseQueue {
  private _queue: Queue | null = null;

  protected constructor(
    protected readonly queueName: string,
    private readonly customOptions: Partial<QueueOptions> = {}
  ) {}

  public initialize(): void {
    if (this._queue) return;

    this._queue = new Queue(this.queueName, {
      connection: bullDbConnection,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: true,
      },
      ...this.customOptions,
    });
  }

  public get queue(): Queue {
    if (!this._queue) {
      throw new Error(`Queue "${this.queueName}" has not been initialized yet.`);
    }
    return this._queue;
  }

  public async add(name: string, data: unknown, opts?: JobsOptions): Promise<unknown> {
    return await this.queue.add(name, data, opts);
  }

  public async upsertJobScheduler(
    schedulerId: string,
    repeatOptions: Omit<RepeatOptions, 'key'>,
    jobTemplate: { name: string; data: unknown; opts?: JobsOptions }
  ): Promise<unknown> {
    return await this.queue.upsertJobScheduler(schedulerId, repeatOptions, jobTemplate);
  }
}
