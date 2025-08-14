import { IAppPkg, AppRunPriority } from 'app-life-cycle-pkg';
import { EmailDeliveryAction, SendEmailDTO } from 'email-delivery-pkg';
import { transportService, TransportAdapterName, CorrelatedRequestDTO } from 'transport-pkg';
import { KafkaTransportAdapter } from 'kafka-transport-adapter';

import SendEmailCommand from './commands/email/send-email.command';
import emailOpWorker from '@/queues/workers/email-op.worker';

class App implements IAppPkg {
  async init(): Promise<void> {
    transportService.registerTransport(TransportAdapterName.Kafka, new KafkaTransportAdapter('email-delivery'));
    transportService.transportsReceive(EmailDeliveryAction.SendEmail, async (data: CorrelatedRequestDTO) => {
      this.sendEmailMessageReceived(data);
    });
  }

  async shutdown(): Promise<void> {
    await emailOpWorker.close();
  }

  getPriority(): number {
    return AppRunPriority.Low;
  }

  private async sendEmailMessageReceived(message: CorrelatedRequestDTO): Promise<void> {
    const sendEmailCommand = new SendEmailCommand();
    await sendEmailCommand.execute(message as CorrelatedRequestDTO<SendEmailDTO>);
  }
}

export default new App();
