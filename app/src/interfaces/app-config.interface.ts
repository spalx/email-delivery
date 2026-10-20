export interface IAppConfig {
  app: {
    port: number;
    host: string;
    providers: string;
    fake_providers_port: number;
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
