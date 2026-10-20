import { logger } from '@spalx/common-loggers-pkg';
import { appService } from '@spalx/app-life-cycle-pkg';

import app from './app';
import { assertProvidersAllowed } from './common/env';

async function startServer(): Promise<void> {
  try {
    logger.info('Starting email-delivery service');

    // Before anything connects or listens, so a refused start serves nothing.
    assertProvidersAllowed();

    await appService.run(app);

    logger.info('email-delivery service running');
  } catch (error) {
    logger.error('Failed to start email-delivery service', error);
    process.exit(1);
  }
}

startServer();
