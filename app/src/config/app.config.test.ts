import { IAppConfig } from '@/interfaces/app-config.interface';

const CONFIG_VARIABLES = [
  'PORT',
  'HOST',
  'PROVIDERS',
  'FAKE_PROVIDERS_PORT',
  'BULL_DB_HOST',
  'BULL_DB_PORT',
  'MAILGUN_API_KEY',
  'MAILGUN_USERNAME',
  'MAILGUN_URL',
  'TRANSPORT_FOR_BROADCAST',
] as const;

type ConfigEnv = Partial<Record<(typeof CONFIG_VARIABLES)[number], string>>;

function setConfigEnv(env: ConfigEnv): void {
  for (const name of CONFIG_VARIABLES) {
    Reflect.deleteProperty(process.env, name);
  }
  Object.assign(process.env, env);
}

// Loads a fresh copy of the config with exactly these variables set, since it reads process.env on import.
async function loadConfig(env: ConfigEnv): Promise<IAppConfig> {
  setConfigEnv(env);

  let config: IAppConfig | undefined;
  await jest.isolateModulesAsync(async () => {
    config = (await import('./app.config')).default;
  });
  if (!config) {
    throw new Error('app.config did not load');
  }
  return config;
}

describe('appConfig', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    setConfigEnv(originalEnv);
  });

  describe('should_read_every_value_from_the_environment_when_it_is_set', () => {
    it('should take each value from its variable, with numbers converted', async () => {
      // Arrange
      const env: ConfigEnv = {
        PORT: '4040',
        HOST: 'mailer',
        PROVIDERS: 'fake',
        FAKE_PROVIDERS_PORT: '4140',
        BULL_DB_HOST: 'mailer-bull-db',
        BULL_DB_PORT: '6380',
        MAILGUN_API_KEY: 'key-123',
        MAILGUN_USERNAME: 'api',
        MAILGUN_URL: 'https://mailgun.invalid/v3/example.test',
        TRANSPORT_FOR_BROADCAST: 'HTTP',
      };

      // Act
      const config = await loadConfig(env);

      // Assert
      expect(config).toEqual({
        app: { port: 4040, host: 'mailer', providers: 'fake', fake_providers_port: 4140 },
        bullDb: { host: 'mailer-bull-db', port: 6380 },
        mailgun: { key: 'key-123', username: 'api', url: 'https://mailgun.invalid/v3/example.test' },
        transport: { for_broadcast: 'HTTP' },
      });
    });
  });

  describe('should_fall_back_to_the_defaults_when_values_are_not_set', () => {
    it('should use the default hosts and transport, and empty Mailgun values, when unset', async () => {
      const config = await loadConfig({});

      expect(config.app.host).toBe('email-delivery');
      expect(config.app.providers).toBe('');
      expect(config.bullDb.host).toBe('email-delivery-bull-db');
      expect(config.transport.for_broadcast).toBe('Kafka');
      expect(config.mailgun).toEqual({ key: '', username: '', url: '' });
    });

    it('should use the defaults when the variables are empty', async () => {
      const config = await loadConfig({ HOST: '', BULL_DB_HOST: '', TRANSPORT_FOR_BROADCAST: '' });

      expect(config.app.host).toBe('email-delivery');
      expect(config.bullDb.host).toBe('email-delivery-bull-db');
      expect(config.transport.for_broadcast).toBe('Kafka');
    });

    it('should have no default for the ports', async () => {
      const config = await loadConfig({});

      expect(config.app.port).toBeNaN();
      expect(config.app.fake_providers_port).toBeNaN();
      expect(config.bullDb.port).toBeNaN();
    });
  });

  it('should be frozen', async () => {
    const config = await loadConfig({ PORT: '3040' });

    expect(Object.isFrozen(config)).toBe(true);
  });
});
