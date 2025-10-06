import { IAppPkg, AppRunPriority } from 'app-life-cycle-pkg';
import { EmailDeliveryAction, SendEmailDTO, SERVICE_NAME } from 'email-delivery-pkg';
import { transportService, TransportAdapterName, CorrelatedMessage } from 'transport-pkg';
import { HTTPTransportAdapter } from 'http-transport-adapter';
import { KafkaTransportAdapter } from 'kafka-transport-adapter';
import { serviceDiscoveryService } from 'service-discovery-pkg';

import SendEmailCommand from '@/commands/email/send-email.command';
import emailOpWorker from '@/queues/workers/email-op.worker';
import appConfig from '@/config/app.config';

class App implements IAppPkg {
  private httpTransportAdapter: HTTPTransportAdapter;
  private kafkaTransportAdapter: KafkaTransportAdapter;

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
    transportService.setActionsToBroadcast([
      EmailDeliveryAction.DidSendEmail
    ]);
  }

  async init(): Promise<void> {
    // Make service discoverable by other services
    await serviceDiscoveryService.registerService({
      service_name: SERVICE_NAME,
      host: appConfig.app.host,
      port: appConfig.app.port,
    });
  }

  async shutdown(): Promise<void> {
    await serviceDiscoveryService.deregisterService(SERVICE_NAME);
    await emailOpWorker.close();
  }

  getPriority(): number {
    return AppRunPriority.High;
  }

  getName(): string {
    return SERVICE_NAME;
  }

  getDependencies(): IAppPkg[] {
    return [
      transportService,
      this.httpTransportAdapter,
      this.kafkaTransportAdapter,
      serviceDiscoveryService
    ];
  }
}

export default new App();
