import appConfig from '@/config/app.config';

const PROVIDER_MODES = ['', 'real', 'fake'];
const FAKE_PROVIDERS_ENVS = ['development', 'test'];

export class ProvidersConfigError extends Error {
  override name = 'ProvidersConfigError';
}

// Read from process.env when called: the fake needs NODE_ENV set explicitly.
function isFakeProvidersEnv(): boolean {
  return FAKE_PROVIDERS_ENVS.includes(process.env.NODE_ENV ?? '');
}

export function isFakeProviders(): boolean {
  return appConfig.app.providers === 'fake' && isFakeProvidersEnv();
}

export function assertProvidersAllowed(): void {
  const { providers, fake_providers_port: port } = appConfig.app;

  if (!PROVIDER_MODES.includes(providers)) {
    throw new ProvidersConfigError(`Unknown PROVIDERS value "${providers}": leave it unset, or set it to real or fake`);
  }

  if (providers === 'fake' && !isFakeProvidersEnv()) {
    throw new ProvidersConfigError(
      `PROVIDERS=fake needs NODE_ENV set to development or test (it is ${process.env.NODE_ENV || 'unset'})`
    );
  }

  if (providers === 'fake' && !(Number.isInteger(port) && port > 0 && port <= 65535)) {
    throw new ProvidersConfigError('PROVIDERS=fake needs FAKE_PROVIDERS_PORT set to a port number');
  }
}
