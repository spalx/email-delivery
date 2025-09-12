import { IAppPkg, AppRunPriority } from 'app-life-cycle-pkg';
import { EmailDeliveryAction, SendEmailDTO } from 'email-delivery-pkg';
import { transportService, TransportAdapterName, CorrelatedMessage } from 'transport-pkg';
import { HTTPTransportAdapter } from 'http-transport-adapter';
import { KafkaTransportAdapter } from 'kafka-transport-adapter';

import SendEmailCommand from './commands/email/send-email.command';
import emailOpWorker from '@/queues/workers/email-op.worker';
import appConfig from '@/config/app.config';

class App implements IAppPkg {
  async init(): Promise<void> {
    //TODO: use service-discovery here
    transportService.registerTransport(TransportAdapterName.Kafka, new KafkaTransportAdapter('kafka:9092', 'email-delivery'));
    transportService.registerTransport(TransportAdapterName.HTTP, new HTTPTransportAdapter(appConfig.app.port));

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

  async shutdown(): Promise<void> {
    await emailOpWorker.close();
  }

  getPriority(): number {
    return AppRunPriority.Low;
  }
}

export default new App();
