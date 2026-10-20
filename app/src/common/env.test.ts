type EnvModule = typeof import('./env');

const ENV_VARIABLES = ['NODE_ENV', 'PROVIDERS', 'FAKE_PROVIDERS_PORT'] as const;

type Env = Partial<Record<(typeof ENV_VARIABLES)[number], string>>;

// Loads a fresh copy of env.ts and its config with exactly these variables set, since the config reads process.env
// on import. The variables stay set until afterEach restores them, because env.ts also reads NODE_ENV when called.
async function loadEnv(env: Env): Promise<EnvModule> {
  for (const name of ENV_VARIABLES) {
    setVariable(name, env[name]);
  }

  let loaded: EnvModule | undefined;
  await jest.isolateModulesAsync(async () => {
    loaded = await import('./env');
  });
  if (!loaded) {
    throw new Error('env did not load');
  }
  return loaded;
}

function setVariable(name: string, value: string | undefined): void {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, name);
  } else {
    process.env[name] = value;
  }
}

const originalEnv: Env = Object.fromEntries(ENV_VARIABLES.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of ENV_VARIABLES) {
    setVariable(name, originalEnv[name]);
  }
});

describe('env - isFakeProviders', () => {
  it.each(['development', 'test'])('should be on with PROVIDERS=fake and NODE_ENV=%s', async (nodeEnv) => {
    expect((await loadEnv({ NODE_ENV: nodeEnv, PROVIDERS: 'fake' })).isFakeProviders()).toBe(true);
  });

  it.each([
    ['production', 'fake'],
    [undefined, 'fake'],
    ['development', undefined],
    ['development', 'real'],
    ['test', 'FAKE'],
  ])('should be off with NODE_ENV=%s and PROVIDERS=%s', async (nodeEnv, providers) => {
    expect((await loadEnv({ NODE_ENV: nodeEnv, PROVIDERS: providers })).isFakeProviders()).toBe(false);
  });
});

describe('env - assertProvidersAllowed', () => {
  describe('should_allow_a_known_and_permitted_provider_setting', () => {
    it.each<Env>([
      {},
      { NODE_ENV: 'production' },
      { NODE_ENV: 'production', PROVIDERS: 'real' },
      { NODE_ENV: 'development', PROVIDERS: '' },
      { NODE_ENV: 'development', PROVIDERS: 'fake', FAKE_PROVIDERS_PORT: '3140' },
      { NODE_ENV: 'test', PROVIDERS: 'fake', FAKE_PROVIDERS_PORT: '3140' },
    ])('should allow %j', async (env) => {
      const { assertProvidersAllowed } = await loadEnv(env);

      expect(() => assertProvidersAllowed()).not.toThrow();
    });
  });

  describe('should_refuse_with_a_providers_config_error', () => {
    it('should throw a ProvidersConfigError, so the start-up failure names its cause', async () => {
      const { assertProvidersAllowed, ProvidersConfigError } = await loadEnv({ PROVIDERS: 'fak' });

      expect(() => assertProvidersAllowed()).toThrow(ProvidersConfigError);
      expect(() => assertProvidersAllowed()).toThrow(expect.objectContaining({ name: 'ProvidersConfigError' }));
    });
  });

  describe('should_refuse_an_unknown_providers_value', () => {
    it.each(['fak', 'FAKE', 'mock'])('should refuse PROVIDERS=%s', async (providers) => {
      const { assertProvidersAllowed } = await loadEnv({ NODE_ENV: 'development', PROVIDERS: providers });

      expect(() => assertProvidersAllowed()).toThrow(
        `Unknown PROVIDERS value "${providers}": leave it unset, or set it to real or fake`
      );
    });
  });

  describe('should_refuse_the_fake_outside_development_and_test', () => {
    it.each([
      ['production', 'production'],
      ['staging', 'staging'],
      [undefined, 'unset'],
    ])('should refuse PROVIDERS=fake with NODE_ENV=%s', async (nodeEnv, shown) => {
      // Arrange
      const { assertProvidersAllowed } = await loadEnv({
        NODE_ENV: nodeEnv,
        PROVIDERS: 'fake',
        FAKE_PROVIDERS_PORT: '3140',
      });

      // Act / Assert
      expect(() => assertProvidersAllowed()).toThrow(
        `PROVIDERS=fake needs NODE_ENV set to development or test (it is ${shown})`
      );
    });
  });

  describe('should_refuse_the_fake_without_a_port_for_its_test_endpoints', () => {
    it.each([undefined, '', 'abc', '0', '-1', '70000', '3140.5'])(
      'should refuse PROVIDERS=fake with FAKE_PROVIDERS_PORT=%s',
      async (port) => {
        const { assertProvidersAllowed } = await loadEnv({
          NODE_ENV: 'test',
          PROVIDERS: 'fake',
          FAKE_PROVIDERS_PORT: port,
        });

        expect(() => assertProvidersAllowed()).toThrow('PROVIDERS=fake needs FAKE_PROVIDERS_PORT set to a port number');
      }
    );
  });
});
