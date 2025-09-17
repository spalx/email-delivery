import { IAppConfig } from '@/interfaces/app-config.interface';

const appConfig: IAppConfig = {
  app: {
    port: Number(process.env.PORT),
    host: process.env.HOST || 'email-delivery',
  },
  bullDb: {
    host: process.env.BULL_DB_HOST || 'email-delivery-bull-db',
    port: Number(process.env.BULL_DB_PORT),
  },
  mailgun: {
    key: process.env.MAILGUN_API_KEY || '',
    username: process.env.MAILGUN_USERNAME || '',
    url: process.env.MAILGUN_URL || '',
  },
  transport: {
    for_broadcast: process.env.TRANSPORT_FOR_BROADCAST || 'Kafka',
  },
};

export default Object.freeze(appConfig);
