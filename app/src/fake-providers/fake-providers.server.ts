import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { IAppPkg, AppRunPriority } from '@spalx/app-life-cycle-pkg';
import { logger } from '@spalx/common-loggers-pkg';

import appConfig from '@/config/app.config';
import fakeProvidersController from '@/controllers/fake-providers.controller';

// Serves the /_test endpoints on their own port. The HTTP transport's server answers only POST /http-transport and
// can't be given other routes. Only started while PROVIDERS=fake.
export class FakeProvidersServer implements IAppPkg {
  private server: Server | null = null;

  constructor(private readonly port: number = appConfig.app.fake_providers_port) {}

  async init(): Promise<void> {
    const server = createServer((req, res) => {
      void this.handleRequest(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.port, resolve);
    });
    this.server = server;

    logger.info(`[FAKE PROVIDERS] Test endpoints listening on port ${this.port}`);
  }

  async shutdown(): Promise<void> {
    const server = this.server;
    if (!server) {
      return;
    }
    this.server = null;

    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  getName(): string {
    return 'fake-providers-server';
  }

  getPriority(): number {
    return AppRunPriority.Low;
  }

  getDependencies(): IAppPkg[] {
    return [];
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let status = 500;
    let body: object = { error: 'Internal Server Error' };

    try {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
      }
      ({ status, body } = fakeProvidersController.handle(req.method, req.url, raw));
    } catch (error) {
      logger.error(`[FAKE PROVIDERS] ${req.method} ${req.url} failed`, error);
    }

    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  }
}
