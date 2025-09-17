import { IAppPkg, AppRunPriority } from 'app-life-cycle-pkg';
import { EmailDeliveryAction, SendEmailDTO, SERVICE_NAME } from 'email-delivery-pkg';
import { transportService, TransportAdapterName, CorrelatedMessage } from 'transport-pkg';
import { HTTPTransportAdapter } from 'http-transport-adapter';
import { KafkaTransportAdapter } from 'kafka-transport-adapter';
import { serviceDiscoveryService, ServiceDTO } from 'service-discovery-pkg';

import SendEmailCommand from './commands/email/send-email.command';
import emailOpWorker from '@/queues/workers/email-op.worker';
import appConfig from '@/config/app.config';

class App implements IAppPkg {
  async init(): Promise<void> {
    transportService.registerTransport(TransportAdapterName.HTTP, new HTTPTransportAdapter(appConfig.app.port));
    transportService.registerTransport(TransportAdapterName.Kafka, new KafkaTransportAdapter(appConfig.app.host));

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

    // Make service discoverable by other services
    await serviceDiscoveryService.registerService({
      service_name: SERVICE_NAME,
      host: appConfig.app.host,
      port: appConfig.app.port,
    });
  }

  async shutdown(): Promise<void> {
    await serviceDiscoveryService.deregisterService(appConfig.app.host);
    await emailOpWorker.close();
  }

  getPriority(): number {
    return AppRunPriority.Low;
  }
}

export default new App();
