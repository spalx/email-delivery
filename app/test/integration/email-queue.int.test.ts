import { EmailDeliveryAction, SendEmailDTO } from '@spalx/email-delivery-pkg';
import { CorrelatedMessage, TransportAdapterName, transportService } from '@spalx/transport-pkg';
import { logger } from '@spalx/common-loggers-pkg';

import SendEmailCommand from '@/commands/email/send-email.command';
import emailOpQueue from '@/queues/queues/email-op.queue';
import emailOpWorker from '@/queues/workers/email-op.worker';

const fetchMock = jest.mocked(fetch);

function buildEmail(overrides: Partial<SendEmailDTO> = {}): SendEmailDTO {
  return {
    from: 'billing@example.test',
    to: ['a@example.test', 'b@example.test'],
    subject: 'Invoice',
    body: '<p>Hi</p>',
    ...overrides,
  };
}

let requestCount = 0;

function buildRequest(data: SendEmailDTO): CorrelatedMessage<SendEmailDTO> {
  requestCount += 1;
  const correlationId = `c0ffee00-0000-4000-8000-${String(requestCount).padStart(12, '0')}`;
  return CorrelatedMessage.create(correlationId, EmailDeliveryAction.SendEmail, TransportAdapterName.HTTP, data);
}

function broadcasts(): CorrelatedMessage[] {
  return jest.mocked(transportService.broadcast).mock.calls.map(([message]) => message);
}

async function waitFor(condition: () => boolean | Promise<boolean>, what: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function jobsInRedis(): Promise<number> {
  const counts = await emailOpQueue.queue.getJobCounts();
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

function mailgunAnswers(status: number, body = '{}'): void {
  fetchMock.mockResolvedValueOnce(new Response(body, { status }));
}

function sentForm(call = 0): { url: string; form: FormData } {
  const [url, init] = fetchMock.mock.calls[call];
  return { url: String(url), form: init?.body as FormData };
}

describe('email queue against a real Redis', () => {
  beforeAll(() => {
    emailOpQueue.initialize();
  });

  beforeEach(() => {
    jest.spyOn(transportService, 'broadcast').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await emailOpWorker.close();
    await emailOpQueue.queue.close();
  });

  // Runs first, before the worker starts, so the requests are still waiting when they are counted.
  it('queues a request sent twice with the same id once, and sends it once', async () => {
    const request = buildRequest(buildEmail());

    await new SendEmailCommand().execute(request);
    await new SendEmailCommand().execute(request);

    expect(await jobsInRedis()).toBe(1);
    const job = await emailOpQueue.queue.getJob(request.id);
    expect(job?.opts.priority).toBe(1);

    mailgunAnswers(200);
    emailOpWorker.initialize();
    await waitFor(async () => broadcasts().length === 1 && (await jobsInRedis()) === 0, 'the email to be sent');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(broadcasts()[0]).toMatchObject({ correlation_id: request.correlation_id });
  });

  it('sends a queued email through Mailgun, reports it, and leaves no job in Redis', async () => {
    const request = buildRequest(buildEmail());
    mailgunAnswers(200);

    await new SendEmailCommand().execute(request);
    await waitFor(async () => broadcasts().length === 1 && (await jobsInRedis()) === 0, 'the email to be sent');

    const { url, form } = sentForm();
    expect(url).toBe('https://mailgun.invalid/v3/example.test/messages');
    expect(form.get('from')).toBe('billing@example.test');
    expect(form.get('to')).toBe('a@example.test,b@example.test');
    expect(form.get('subject')).toBe('Invoice');
    expect(form.get('html')).toBe('<p>Hi</p>');
    const [message] = broadcasts();
    expect(message.isError()).toBe(false);
    expect(message).toMatchObject({
      correlation_id: request.correlation_id,
      action: EmailDeliveryAction.DidSendEmail,
      transport: TransportAdapterName.Kafka,
      data: { from: 'billing@example.test', to: ['a@example.test', 'b@example.test'], subject: 'Invoice' },
    });
  });

  it('sends a queued email with an attachment and an inline file to Mailgun as files', async () => {
    const request = buildRequest(
      buildEmail({
        body: '<img src="cid:logo.png">',
        attachments: {
          'invoice.pdf': {
            content_base64: Buffer.from('%PDF-1.7').toString('base64'),
            content_type: 'application/pdf',
          },
        },
        inline: { 'logo.png': { content_base64: Buffer.from('PNG').toString('base64'), content_type: 'image/png' } },
      })
    );
    mailgunAnswers(200);

    await new SendEmailCommand().execute(request);
    await waitFor(async () => broadcasts().length === 1 && (await jobsInRedis()) === 0, 'the email to be sent');

    expect(broadcasts()[0].isError()).toBe(false);
    const { form } = sentForm();
    const [attachment] = form.getAll('attachment') as File[];
    expect([attachment.name, attachment.type, await attachment.text()]).toEqual([
      'invoice.pdf',
      'application/pdf',
      '%PDF-1.7',
    ]);
    const [inline] = form.getAll('inline') as File[];
    expect([inline.name, inline.type, await inline.text()]).toEqual(['logo.png', 'image/png', 'PNG']);
  });

  it('reports a request that fails validation without calling Mailgun, and leaves no job in Redis', async () => {
    const request = buildRequest(buildEmail({ from: '', to: [] }));

    await new SendEmailCommand().execute(request);
    await waitFor(async () => broadcasts().length === 1 && (await jobsInRedis()) === 0, 'the failure to be reported');

    expect(fetchMock).not.toHaveBeenCalled();
    const [message] = broadcasts();
    expect(message.isError()).toBe(true);
    expect(message).toMatchObject({ correlation_id: request.correlation_id, code: 400 });
  });

  it('reports a Mailgun error and leaves no job in Redis', async () => {
    const request = buildRequest(buildEmail());
    mailgunAnswers(401, 'Forbidden');

    await new SendEmailCommand().execute(request);
    await waitFor(async () => broadcasts().length === 1 && (await jobsInRedis()) === 0, 'the failure to be reported');

    const [message] = broadcasts();
    expect(message.isError()).toBe(true);
    expect(message).toMatchObject({
      correlation_id: request.correlation_id,
      code: 500,
      message: 'Mailgun API error: 401 - Forbidden',
    });
  });

  it('logs a job whose report cannot be broadcast as failed, and leaves no job in Redis', async () => {
    const request = buildRequest(buildEmail());
    mailgunAnswers(200);
    jest.mocked(transportService.broadcast).mockRejectedValueOnce(new Error('Kafka producer is disconnected'));

    await new SendEmailCommand().execute(request);
    await waitFor(async () => jest.mocked(logger.error).mock.calls.length > 0, 'the failed job to be logged');
    await waitFor(async () => (await jobsInRedis()) === 0, 'the failed job to be removed');

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Kafka producer is disconnected'));
  });

  it('starts each test with an empty queue', async () => {
    await emailOpWorker.close();
    await new SendEmailCommand().execute(buildRequest(buildEmail()));
    expect(await jobsInRedis()).toBe(1);
  });

  it('finds the queue empty after the previous test left a job waiting', async () => {
    expect(await jobsInRedis()).toBe(0);
  });
});
