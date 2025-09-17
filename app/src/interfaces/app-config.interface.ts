export interface IAppConfig {
  app: {
    port: number;
    host: string;
  };
  bullDb: {
    host: string;
    port: number;
  };
  mailgun: {
    key: string;
    username: string;
    url: string;
  };
  transport: {
    for_broadcast: string;
  };
}
