import { Worker, WorkerOptions, Job } from 'bullmq';
import { logger } from '@spalx/common-loggers-pkg';
import bullDbConnection from '@/config/bull.config';

export abstract class BaseWorker {
  private _worker: Worker | null = null;

  protected constructor(
    protected readonly queueName: string,
    protected readonly jobHandlers: Record<string, (job: Job) => Promise<void>>,
    private readonly customOptions: Partial<WorkerOptions> = {}
  ) {}

  public initialize(): void {
    if (this._worker) return;

    this._worker = new Worker(
      this.queueName,
      async (job: Job) => {
        await this.processJob(job);
      },
      {
        connection: bullDbConnection,
        ...this.customOptions,
      }
    );

    this._worker.on('failed', (job?: Job, error?: Error) => {
      logger.error(
        `Worker [${this.queueName}] - Job ${job?.name} with ID ${job?.id} failed: ${error?.message || 'Unknown error'}`
      );
    });
  }

  protected async processJob(job: Job): Promise<void> {
    const handler = this.jobHandlers[job.name];
    if (handler) {
      await handler(job);
    } else {
      logger.error(`No handler found for job: ${job.name} in queue: ${this.queueName}`);
    }
  }

  public async close(): Promise<void> {
    if (this._worker) {
      logger.info(`Shutting down worker for queue: ${this.queueName}`);
      await this._worker.close();
    }
  }
}
