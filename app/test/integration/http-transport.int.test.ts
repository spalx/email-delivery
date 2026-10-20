import http from 'http';
import net from 'net';
import type { IAppPkg } from '@spalx/app-life-cycle-pkg';
import type { SendEmailDTO } from '@spalx/email-delivery-pkg';
import type { CorrelatedMessage } from '@spalx/transport-pkg';

type TransportPkg = typeof import('@spalx/transport-pkg');
type EmailPkg = typeof import('@spalx/email-delivery-pkg');
type AdapterPkg = typeof import('@spalx/http-transport-adapter');
type LoggersPkg = typeof import('../mocks/common-loggers');

jest.setTimeout(20_000);

interface OutboxFile {
  filename: string;
  size: number;
  content_type: string;
}

async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as net.AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

// The global fetch is the no-network guard, so the test endpoints are called with node:http.
function readOutbox(port: number): Promise<{ attachments: OutboxFile[]; inline: OutboxFile[] }[]> {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: '/_test/outbox' }, (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => resolve(JSON.parse(raw).messages));
      })
      .on('error', reject);
  });
}

async function waitFor(condition: () => boolean, what: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const started: IAppPkg[] = [];
const closers: (() => Promise<void>)[] = [];

// Starts email-delivery as it runs with PROVIDERS=fake: its HTTP transport, queue, worker and test endpoints.
async function startFakeService() {
  const servicePort = await freePort();
  const fakePort = await freePort();
  const env = { PORT: String(servicePort), PROVIDERS: 'fake', FAKE_PROVIDERS_PORT: String(fakePort) };
  const previous = Object.fromEntries(Object.keys(env).map((name) => [name, process.env[name]]));
  Object.assign(process.env, env);

  let loaded!: {
    app: IAppPkg;
    queue: (typeof import('@/queues/queues/email-op.queue'))['default'];
    worker: (typeof import('@/queues/workers/email-op.worker'))['default'];
    transport: TransportPkg;
    pkg: EmailPkg;
    adapters: AdapterPkg;
    loggers: LoggersPkg;
  };
  try {
    jest.isolateModules(() => {
      loaded = {
        app: require('@/app').default,
        queue: require('@/queues/queues/email-op.queue').default,
        worker: require('@/queues/workers/email-op.worker').default,
        transport: require('@spalx/transport-pkg'),
        pkg: require('@spalx/email-delivery-pkg'),
        adapters: require('@spalx/http-transport-adapter'),
        loggers: require('@spalx/common-loggers-pkg'),
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
  closers.push(
    () => loaded.worker.close(),
    () => loaded.queue.queue.close()
  );
  const servers = (loaded.app.getDependencies?.() ?? []).filter(
    (dependency) =>
      dependency instanceof loaded.adapters.HTTPTransportAdapter || dependency.getName() === 'fake-providers-server'
  );
  for (const server of servers) {
    await server.init?.();
    started.push(server);
  }

  const caller = new loaded.adapters.HTTPTransportAdapter();
  const send = (data: SendEmailDTO): Promise<CorrelatedMessage> =>
    caller.send(
      loaded.transport.CorrelatedMessage.create(
        'c0ffee00-0000-4000-8000-0000000000aa',
        loaded.pkg.EmailDeliveryAction.SendEmail,
        loaded.transport.TransportAdapterName.HTTP,
        data
      ),
      { host: '127.0.0.1', port: servicePort }
    );
  const results = (): CorrelatedMessage[] =>
    jest.mocked(loaded.transport.transportService.broadcast).mock.calls.map(([message]) => message);

  return { send, results, fakePort, httpLogger: loaded.loggers.httpLogger, servers };
}

describe('Email with files over the real HTTP transport and queue, into the fake', () => {
  afterEach(async () => {
    while (started.length > 0) {
      await started.pop()?.shutdown?.();
    }
    while (closers.length > 0) {
      await closers.pop()?.();
    }
    jest.restoreAllMocks();
  });

  it('records the attachment and inline file in the outbox and keeps their content out of the logs', async () => {
    // Arrange
    const service = await startFakeService();
    expect(service.servers).toHaveLength(2);
    const invoice = Buffer.alloc(2048, 'invoice').toString('base64');
    const logo = Buffer.from('PNG').toString('base64');

    // Act
    const reply = await service.send({
      from: 'noreply@example.test',
      to: ['user@example.test'],
      subject: 'Your invoice',
      body: '<img src="cid:logo.png">',
      attachments: { 'invoice.pdf': { content_base64: invoice, content_type: 'application/pdf' } },
      inline: { 'logo.png': { content_base64: logo, content_type: 'image/png' } },
    });
    await waitFor(() => service.results().length === 1, 'the email to be sent');

    // Assert
    expect(reply.isError()).toBe(false);
    expect(service.results()[0].isError()).toBe(false);
    const [email] = await readOutbox(service.fakePort);
    expect(email.attachments).toEqual([{ filename: 'invoice.pdf', size: 2048, content_type: 'application/pdf' }]);
    expect(email.inline).toEqual([{ filename: 'logo.png', size: 3, content_type: 'image/png' }]);

    const logLines = jest.mocked(service.httpLogger.info).mock.calls.map(([line]) => String(line));
    expect(logLines.filter((line) => line.includes(invoice.slice(0, 64)) || line.includes(logo))).toEqual([]);
    expect(logLines).toContainEqual(
      expect.stringMatching(
        /^Request received: POST \/http-transport emaildelivery\.sendEmail c0ffee00-0000-4000-8000-0000000000aa \(\d+ bytes\)$/
      )
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
