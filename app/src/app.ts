import { IAppPkg } from 'app-life-cycle-pkg';
import { CorrelatedRequestDTO, kafkaService } from 'kafka-pkg';
import { SendEmailDTO, EmailDeliveryKafkaTopic } from 'email-delivery-pkg';

import emailOpWorker from '@/queues/workers/email-op.worker';
import { SendEmailCommand } from '@/commands/email';

class App implements IAppPkg {
  async init(): Promise<void> {
    await kafkaService.createTopics([
      { topic: EmailDeliveryKafkaTopic.SendEmail, numPartitions: 1, replicationFactor: 1 },
    ]);

    await kafkaService.subscribe({
      [EmailDeliveryKafkaTopic.SendEmail]: async (message: object) => {
        const sendEmailCommand = new SendEmailCommand();
        await sendEmailCommand.execute(message as CorrelatedRequestDTO<SendEmailDTO>);
      },
    });
  }

  async shutdown(): Promise<void> {
    await emailOpWorker.close();
  }
}

export default new App();
