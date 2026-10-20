// Replaces bullmq in tests. A real Queue or Worker opens a Redis connection as soon as it is built, so no
// test can reach Redis. Each fake records how it was built, and its class lists every instance.
type Processor = (job: unknown) => Promise<unknown>;

export class Queue {
  static readonly instances: Queue[] = [];

  add = jest.fn().mockResolvedValue({});
  upsertJobScheduler = jest.fn().mockResolvedValue({});

  constructor(
    readonly name: string,
    readonly opts?: object
  ) {
    Queue.instances.push(this);
  }
}

export class Worker {
  static readonly instances: Worker[] = [];

  on = jest.fn().mockReturnThis();
  close = jest.fn().mockResolvedValue(undefined);

  constructor(
    readonly name: string,
    readonly processor: Processor,
    readonly opts?: object
  ) {
    Worker.instances.push(this);
  }
}
