import appConfig from '@/config/app.config';

const bullDbConnection = {
  host: appConfig.bullDb.host,
  port: appConfig.bullDb.port,
};

export default bullDbConnection;
