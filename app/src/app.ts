import { IAppPkg, AppRunPriority } from '@spalx/app-life-cycle-pkg';
import { EmailDeliveryAction, SendEmailDTO, SERVICE_NAME } from '@spalx/email-delivery-pkg';
import { transportService, TransportAdapterName, CorrelatedMessage } from '@spalx/transport-pkg';
import { HTTPTransportAdapter } from '@spalx/http-transport-adapter';
import { KafkaTransportAdapter } from '@spalx/kafka-transport-adapter';
import { serviceDiscoveryService } from '@spalx/service-discovery-pkg';

import SendEmailCommand from '@/commands/email/send-email.command';
import emailOpWorker from '@/queues/workers/email-op.worker';
import emailOpQueue from '@/queues/queues/email-op.queue';
import appConfig from '@/config/app.config';
import { logger } from '@spalx/common-loggers-pkg';
import { isFakeProviders } from '@/common/env';
import { FakeProvidersServer } from '@/fake-providers/fake-providers.server';

class App implements IAppPkg {
  private httpTransportAdapter: HTTPTransportAdapter;
  private kafkaTransportAdapter: KafkaTransportAdapter;
  // The /_test endpoints exist only while PROVIDERS=fake.
  private fakeProvidersServer: FakeProvidersServer | null = isFakeProviders() ? new FakeProvidersServer() : null;

  private queues = [emailOpQueue];
  private workers = [emailOpWorker];

  constructor() {
    this.httpTransportAdapter = new HTTPTransportAdapter(appConfig.app.port);
    this.kafkaTransportAdapter = new KafkaTransportAdapter(SERVICE_NAME);

    transportService.registerTransport(TransportAdapterName.HTTP, this.httpTransportAdapter);
    transportService.registerTransport(TransportAdapterName.Kafka, this.kafkaTransportAdapter);

    // Consume via HTTP
    transportService.setActionHandler(EmailDeliveryAction.SendEmail, async (req: CorrelatedMessage) => {
      const sendEmailCommand = new SendEmailCommand();
      await sendEmailCommand.execute(req as CorrelatedMessage<SendEmailDTO>);

      return {};
    });

    // Broadcast via Kafka
    transportService.setActionsToBroadcast([EmailDeliveryAction.DidSendEmail]);
  }

  async init(): Promise<void> {
    this.queues.forEach((manager) => manager.initialize());
    logger.info('All queues initialized successfully');

    this.workers.forEach((manager) => manager.initialize());
    logger.info('All workers started polling safely');

    // Make service discoverable by other services
    await serviceDiscoveryService.registerService({
      service_name: SERVICE_NAME,
      host: appConfig.app.host,
      port: appConfig.app.port,
    });
  }

  async shutdown(): Promise<void> {
    await serviceDiscoveryService.deregisterService(SERVICE_NAME);
    for (const worker of this.workers) {
      await worker.close();
    }
  }

  getPriority(): number {
    return AppRunPriority.High;
  }

  getName(): string {
    return SERVICE_NAME;
  }

  getDependencies(): IAppPkg[] {
    const dependencies: IAppPkg[] = [
      transportService,
      this.httpTransportAdapter,
      this.kafkaTransportAdapter,
      serviceDiscoveryService,
    ];
    if (this.fakeProvidersServer) {
      dependencies.push(this.fakeProvidersServer);
    }
    return dependencies;
  }
}

export default new App();
