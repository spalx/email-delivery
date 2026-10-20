// Mailgun is reached only through fetch, so a request a test has not mocked fails instead of leaving the machine.
globalThis.fetch = jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input);
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
  throw new Error(`Unmocked network request: ${method} ${url}`);
}) as jest.MockedFunction<typeof fetch>;
