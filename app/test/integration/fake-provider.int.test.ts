import http from 'http';
import net from 'net';
import type { SendEmailDTO } from '@spalx/email-delivery-pkg';
import type { CorrelatedMessage, ErrorCorrelatedMessage } from '@spalx/transport-pkg';

type TransportPkg = typeof import('@spalx/transport-pkg');
type EmailPkg = typeof import('@spalx/email-delivery-pkg');

jest.setTimeout(20_000);

interface Reply {
  status: number;
  body: { messages?: { from: string; to: string[]; cc: string[]; subject: string; body: string }[]; error?: string };
}

async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as net.AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

// The global fetch is the no-network guard, so the test endpoints are called with node:http.
function call(port: number, method: string, path: string, body?: object): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path }, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) }));
    });
    req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}

async function waitFor(condition: () => boolean, what: string, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

// Loads the queue, worker and test endpoint server with PROVIDERS=fake, the way the service starts with it.
async function loadFakeService() {
  const port = await freePort();
  const previous = { PROVIDERS: process.env.PROVIDERS, FAKE_PROVIDERS_PORT: process.env.FAKE_PROVIDERS_PORT };
  process.env.PROVIDERS = 'fake';
  process.env.FAKE_PROVIDERS_PORT = String(port);

  let loaded!: {
    queue: (typeof import('@/queues/queues/email-op.queue'))['default'];
    worker: (typeof import('@/queues/workers/email-op.worker'))['default'];
    SendEmailCommand: (typeof import('@/commands/email/send-email.command'))['default'];
    server: InstanceType<(typeof import('@/fake-providers/fake-providers.server'))['FakeProvidersServer']>;
    transport: TransportPkg;
    pkg: EmailPkg;
  };
  try {
    jest.isolateModules(() => {
      const { FakeProvidersServer } = require('@/fake-providers/fake-providers.server');
      loaded = {
        queue: require('@/queues/queues/email-op.queue').default,
        worker: require('@/queues/workers/email-op.worker').default,
        SendEmailCommand: require('@/commands/email/send-email.command').default,
        server: new FakeProvidersServer(),
        transport: require('@spalx/transport-pkg'),
        pkg: require('@spalx/email-delivery-pkg'),
      };
    });
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }

  jest.spyOn(loaded.transport.transportService, 'broadcast').mockResolvedValue(undefined);
  loaded.queue.initialize();
  loaded.worker.initialize();
  await loaded.server.init();
  opened.push(loaded);

  let count = 0;
  const send = async (data: Partial<SendEmailDTO>): Promise<void> => {
    count += 1;
    const { CorrelatedMessage: Message, TransportAdapterName } = loaded.transport;
    const request = Message.create(
      `fa4e0000-0000-4000-8000-${String(count).padStart(12, '0')}`,
      loaded.pkg.EmailDeliveryAction.SendEmail,
      TransportAdapterName.HTTP,
      { from: 'noreply@example.test', to: ['a@example.test'], subject: 'Hi', body: '<p>Hi</p>', ...data }
    );
    await new loaded.SendEmailCommand().execute(request);
  };

  const results = (): CorrelatedMessage[] =>
    jest.mocked(loaded.transport.transportService.broadcast).mock.calls.map(([message]) => message);

  return { send, results, port };
}

const opened: {
  queue: { queue: { close(): Promise<void> } };
  worker: { close(): Promise<void> };
  server: { shutdown(): Promise<void> };
}[] = [];

describe('Fake email provider through the real queue', () => {
  afterEach(async () => {
    while (opened.length > 0) {
      const service = opened.pop();
      await service?.server.shutdown();
      await service?.worker.close();
      await service?.queue.queue.close();
    }
    jest.restoreAllMocks();
  });

  it('records each email in the outbox instead of sending it, readable by any recipient', async () => {
    // Arrange
    const service = await loadFakeService();

    // Act
    await service.send({
      to: ['user@example.test'],
      cc: ['audit@example.test'],
      subject: 'Reset your password',
      body: '<a href="https://example.test/reset/abc">Reset</a>',
    });
    await service.send({ to: ['other@example.test'], subject: 'Welcome' });
    await waitFor(() => service.results().length === 2, 'two results');

    // Assert
    expect(service.results().every((message) => !message.isError())).toBe(true);
    const reply = await call(service.port, 'GET', '/_test/outbox?to=Audit%40Example.test');
    expect(reply).toEqual({
      status: 200,
      body: {
        messages: [
          expect.objectContaining({
            from: 'noreply@example.test',
            to: ['user@example.test'],
            cc: ['audit@example.test'],
            subject: 'Reset your password',
            body: '<a href="https://example.test/reset/abc">Reset</a>',
          }),
        ],
      },
    });
    expect((await call(service.port, 'GET', '/_test/outbox')).body.messages).toHaveLength(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fails the next send on request, then sends again, and starts over on reset', async () => {
    // Arrange
    const service = await loadFakeService();

    // Act
    expect(await call(service.port, 'POST', '/_test/fail-next', { description: 'Blocked' })).toEqual({
      status: 200,
      body: {},
    });
    await service.send({ subject: 'first' });
    await waitFor(() => service.results().length === 1, 'the failed result');
    await service.send({ subject: 'second' });
    await waitFor(() => service.results().length === 2, 'the second result');

    // Assert
    const [failed, sent] = service.results();
    expect(failed.isError()).toBe(true);
    expect((failed as ErrorCorrelatedMessage).message).toBe('Mailgun API error: 400 - {"message":"Blocked"}');
    expect(sent.isError()).toBe(false);
    const outbox = await call(service.port, 'GET', '/_test/outbox');
    expect(outbox.body.messages?.map((email) => email.subject)).toEqual(['second']);

    expect(await call(service.port, 'POST', '/_test/reset')).toEqual({ status: 200, body: {} });
    expect(await call(service.port, 'GET', '/_test/outbox')).toEqual({ status: 200, body: { messages: [] } });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('answers 400 for an invalid body and 404 for an unknown path', async () => {
    const service = await loadFakeService();

    expect(await call(service.port, 'POST', '/_test/fail-next', { description: 5 })).toEqual({
      status: 400,
      body: { error: 'description must be a non-empty string' },
    });
    expect(await call(service.port, 'GET', '/_test/nothing')).toEqual({ status: 404, body: { error: 'Not found' } });
  });
});
