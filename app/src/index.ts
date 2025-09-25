import { logger } from 'common-loggers-pkg';
import { appService } from 'app-life-cycle-pkg';

import app from './app';

async function startServer(): Promise<void> {
  try {
    logger.info('Starting email-delivery service');

    await appService.run(app);

    logger.info('email-delivery service running');
  } catch (error) {
    logger.error('Failed to start email-delivery service', error);
    process.exit(1);
  }
}

startServer();
