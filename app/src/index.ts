import { logger } from 'common-loggers-pkg';
import { appService } from 'app-life-cycle-pkg';
import { kafkaService } from 'kafka-pkg';

import app from './app';

async function startServer(): Promise<void> {
  try {
    logger.info('Starting email-delivery service');

    appService.use(app);
    appService.use(kafkaService);

    await appService.run();

    logger.info('email-delivery service running');
  } catch (error) {
    logger.error('Failed to start email-delivery service', error);
    process.exit(1);
  }
}

startServer();
