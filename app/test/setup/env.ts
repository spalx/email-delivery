// Runs before any module loads, because the config files read process.env on import. Values already
// set are kept.
const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3040',
  HOST: 'email-delivery',
  BULL_DB_HOST: 'bull-db.invalid',
  BULL_DB_PORT: '6379',
  TRANSPORT_FOR_BROADCAST: 'Kafka',
  MAILGUN_API_KEY: 'test-api-key',
  MAILGUN_USERNAME: 'api',
};

for (const [name, value] of Object.entries(TEST_ENV)) {
  process.env[name] ??= value;
}

// Always overridden, even when the shell sets it: a .invalid host never resolves, so no test can reach Mailgun.
process.env.MAILGUN_URL = 'https://mailgun.invalid/v3/example.test';
