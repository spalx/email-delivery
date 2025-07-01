import { IAppConfig } from '@/interfaces/app-config.interface';

const appConfig: IAppConfig = {
  app: {
    port: Number(process.env.PORT),
  },
  bullDb: {
    host: process.env.BULL_DB_HOST ?? 'email-delivery-bull-db',
    port: Number(process.env.BULL_DB_PORT),
  },
  mailgun: {
    key: process.env.MAILGUN_API_KEY || '',
    username: process.env.MAILGUN_USERNAME || '',
    url: process.env.MAILGUN_URL || '',
  },
};

export default Object.freeze(appConfig);
