import http from 'http';
import { AppRunPriority, IAppPkg } from '@spalx/app-life-cycle-pkg';
import { EmailDeliveryAction, SendEmailDTO } from '@spalx/email-delivery-pkg';
import { HTTPTransportAdapter } from '@spalx/http-transport-adapter';
import { KafkaTransportAdapter } from '@spalx/kafka-transport-adapter';
import { serviceDiscoveryService } from '@spalx/service-discovery-pkg';
import { CorrelatedMessage, TransportAdapterName, transportService } from '@spalx/transport-pkg';

import SendEmailCommand from '@/commands/email/send-email.command';
import emailOpQueue from '@/queues/queues/email-op.queue';
import emailOpWorker from '@/queues/workers/email-op.worker';

jest.mock('@/commands/email/send-email.command', () => {
  const execute = jest.fn();
  return { __esModule: true, default: jest.fn().mockImplementation(() => ({ execute })) };
});

jest.mock('@/queues/queues/email-op.queue', () => ({
  __esModule: true,
  default: { initialize: jest.fn() },
}));

jest.mock('@/queues/workers/email-op.worker', () => ({
  __esModule: true,
  default: { initialize: jest.fn(), close: jest.fn() },
}));

type ActionHandler = (req: CorrelatedMessage) => Promise<object>;

function buildRequest(): CorrelatedMessage<SendEmailDTO> {
  return CorrelatedMessage.create(
    'c0ffee00-0000-4000-8000-000000000001',
    EmailDeliveryAction.SendEmail,
    TransportAdapterName.HTTP,
    { from: 'billing@example.test', to: ['a@example.test'], subject: 'Invoice', body: '<p>Hi</p>' }
  );
}

function sendEmailHandler(): ActionHandler {
  const handler = transportService.getActionHandlers()[EmailDeliveryAction.SendEmail];
  if (!handler) {
    throw new Error('No SendEmail handler registered');
  }
  return handler as ActionHandler;
}

function executeMock(): jest.Mock {
  return (new SendEmailCommand() as unknown as { execute: jest.Mock }).execute;
}

describe('App', () => {
  // Copied out in beforeAll, because clearMocks empties the spies' calls before each test.
  let registeredTransports: unknown[][];
  let listenCallCount: number;
  let app: IAppPkg;

  beforeAll(async () => {
    const registerTransport = jest.spyOn(transportService, 'registerTransport');
    const listen = jest.spyOn(http.Server.prototype, 'listen');

    app = (await import('./app')).default;

    registeredTransports = [...registerTransport.mock.calls];
    listenCallCount = listen.mock.calls.length;
  });

  beforeEach(() => {
    jest.spyOn(serviceDiscoveryService, 'registerService').mockResolvedValue(undefined);
    jest.spyOn(serviceDiscoveryService, 'deregisterService').mockResolvedValue(undefined);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('App - constructor', () => {
    it('should register an HTTP and a Kafka transport and list them as dependencies', () => {
      // Assert
      expect(registeredTransports.map(([name]) => name)).toEqual([
        TransportAdapterName.HTTP,
        TransportAdapterName.Kafka,
      ]);
      const [[, httpAdapter], [, kafkaAdapter]] = registeredTransports;
      expect(httpAdapter).toBeInstanceOf(HTTPTransportAdapter);
      expect(kafkaAdapter).toBeInstanceOf(KafkaTransportAdapter);
      expect(app.getDependencies?.()).toEqual([transportService, httpAdapter, kafkaAdapter, serviceDiscoveryService]);
    });

    it('should handle only SendEmail and broadcast only DidSendEmail', () => {
      expect(Object.keys(transportService.getActionHandlers())).toEqual([EmailDeliveryAction.SendEmail]);
      expect(transportService.getBroadcastableActions()).toEqual([EmailDeliveryAction.DidSendEmail]);
    });

    it('should not start the HTTP server', () => {
      expect(listenCallCount).toBe(0);
    });
  });

  describe('App - SendEmail handler', () => {
    it('should run the send-email command with the request and return an empty object', async () => {
      // Arrange
      const req = buildRequest();

      // Act
      const result = await sendEmailHandler()(req);

      // Assert
      expect(result).toEqual({});
      expect(executeMock().mock.calls).toEqual([[req]]);
    });

    it('should pass a command error through', async () => {
      const error = new Error('Queue "EmailOp" has not been initialized yet.');
      executeMock().mockRejectedValueOnce(error);

      await expect(sendEmailHandler()(buildRequest())).rejects.toBe(error);
    });
  });

  describe('App - init', () => {
    it('should start the queue, then the worker, then register the service', async () => {
      // Act
      await app.init?.();

      // Assert
      expect(serviceDiscoveryService.registerService).toHaveBeenCalledWith({
        service_name: 'email-delivery',
        host: 'email-delivery',
        port: 3040,
      });
      const queueStarted = jest.mocked(emailOpQueue.initialize).mock.invocationCallOrder[0];
      const workerStarted = jest.mocked(emailOpWorker.initialize).mock.invocationCallOrder[0];
      const registered = jest.mocked(serviceDiscoveryService.registerService).mock.invocationCallOrder[0];
      expect(queueStarted).toBeLessThan(workerStarted);
      expect(workerStarted).toBeLessThan(registered);
    });

    it('should fail when the service cannot be registered', async () => {
      const error = new Error('Service not found');
      jest.mocked(serviceDiscoveryService.registerService).mockRejectedValueOnce(error);

      await expect(app.init?.()).rejects.toBe(error);
    });
  });

  describe('App - shutdown', () => {
    it('should deregister the service, then close the worker', async () => {
      // Act
      await app.shutdown?.();

      // Assert
      expect(serviceDiscoveryService.deregisterService).toHaveBeenCalledWith('email-delivery');
      expect(emailOpWorker.close).toHaveBeenCalledTimes(1);
      expect(jest.mocked(serviceDiscoveryService.deregisterService).mock.invocationCallOrder[0]).toBeLessThan(
        jest.mocked(emailOpWorker.close).mock.invocationCallOrder[0]
      );
    });
  });

  describe('App - fake providers', () => {
    // Loads a separate copy of the app with these variables set, since the config reads process.env on import.
    async function loadAppWith(env: Record<string, string>): Promise<{
      app: IAppPkg;
      FakeProvidersServer: (typeof import('@/fake-providers/fake-providers.server'))['FakeProvidersServer'];
    }> {
      const previous = Object.fromEntries(Object.keys(env).map((name) => [name, process.env[name]]));
      Object.assign(process.env, env);

      try {
        let loaded!: Awaited<ReturnType<typeof loadAppWith>>;
        await jest.isolateModulesAsync(async () => {
          loaded = {
            app: (await import('./app')).default,
            FakeProvidersServer: (await import('@/fake-providers/fake-providers.server')).FakeProvidersServer,
          };
        });
        return loaded;
      } finally {
        for (const [name, value] of Object.entries(previous)) {
          if (value === undefined) {
            Reflect.deleteProperty(process.env, name);
          } else {
            process.env[name] = value;
          }
        }
      }
    }

    it('should not list the test endpoint server when the providers are real', () => {
      expect(app.getDependencies?.().some((dependency) => dependency.getName() === 'fake-providers-server')).toBe(
        false
      );
    });

    it('should list the test endpoint server, on FAKE_PROVIDERS_PORT, when the providers are fake', async () => {
      // Act
      const loaded = await loadAppWith({ NODE_ENV: 'test', PROVIDERS: 'fake', FAKE_PROVIDERS_PORT: '3140' });

      // Assert
      const dependencies = loaded.app.getDependencies?.() ?? [];
      const servers = dependencies.filter((dependency) => dependency instanceof loaded.FakeProvidersServer);
      expect(servers).toHaveLength(1);
      expect(servers[0]).toMatchObject({ port: 3140 });
      expect(dependencies[dependencies.length - 1]).toBe(servers[0]);
    });

    it('should not list it for PROVIDERS=fake outside development and test', async () => {
      const loaded = await loadAppWith({ NODE_ENV: 'production', PROVIDERS: 'fake', FAKE_PROVIDERS_PORT: '3140' });

      expect(
        loaded.app.getDependencies?.().some((dependency) => dependency.getName() === 'fake-providers-server')
      ).toBe(false);
    });
  });

  describe('App - identity', () => {
    it('should be named email-delivery', () => {
      expect(app.getName()).toBe('email-delivery');
    });

    it('should run with high priority', () => {
      expect(app.getPriority?.()).toBe(AppRunPriority.High);
    });
  });
});
