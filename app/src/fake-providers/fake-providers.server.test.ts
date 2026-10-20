import { EventEmitter } from 'events';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { Readable } from 'stream';
import { AppRunPriority } from '@spalx/app-life-cycle-pkg';
import { logger } from '@spalx/common-loggers-pkg';

import fakeProvidersController from '@/controllers/fake-providers.controller';
import { FakeProvidersServer } from './fake-providers.server';

jest.mock('http', () => ({
  ...jest.requireActual('http'),
  createServer: jest.fn(),
}));

jest.mock('@/controllers/fake-providers.controller', () => ({
  __esModule: true,
  default: { handle: jest.fn() },
}));

type RequestHandler = (req: IncomingMessage, res: ServerResponse) => void;

// Stands in for the node:http server, so no socket is opened.
class ServerStub extends EventEmitter {
  listen = jest.fn((_port: number, callback: () => void) => {
    if (this.listenError) {
      this.emit('error', this.listenError);
    } else {
      callback();
    }
    return this;
  });
  close = jest.fn((callback: (err?: Error) => void) => {
    callback(this.closeError);
    return this;
  });

  constructor(
    private readonly listenError?: Error,
    private readonly closeError?: Error
  ) {
    super();
  }
}

function useServerStub(stub: ServerStub = new ServerStub()): ServerStub {
  jest.mocked(createServer).mockReturnValue(stub as never);
  return stub;
}

function capturedHandler(): RequestHandler {
  return jest.mocked(createServer).mock.calls[0][0] as unknown as RequestHandler;
}

function buildRequest(method: string, url: string, chunks: string[] | Error): IncomingMessage {
  const stream =
    chunks instanceof Error
      ? new Readable({
          read() {
            this.destroy(chunks);
          },
        })
      : Readable.from(chunks);
  return Object.assign(stream, { method, url }) as unknown as IncomingMessage;
}

// Resolves once the handler has written its reply.
function buildResponse(): { res: ServerResponse; replied: Promise<void>; writeHead: jest.Mock; end: jest.Mock } {
  let done!: () => void;
  const replied = new Promise<void>((resolve) => (done = resolve));
  const writeHead = jest.fn();
  const end = jest.fn(() => done());
  return { res: { writeHead, end } as unknown as ServerResponse, replied, writeHead, end };
}

describe('FakeProvidersServer', () => {
  describe('should_listen_on_its_port_only_once_started', () => {
    it('should not create a server before init', () => {
      new FakeProvidersServer(3140);

      expect(createServer).not.toHaveBeenCalled();
    });

    it('should listen on the given port and log it', async () => {
      // Arrange
      const stub = useServerStub();

      // Act
      await new FakeProvidersServer(3140).init();

      // Assert
      expect(stub.listen).toHaveBeenCalledWith(3140, expect.any(Function));
      expect(jest.mocked(logger.info).mock.calls).toEqual([['[FAKE PROVIDERS] Test endpoints listening on port 3140']]);
    });

    it('should listen on FAKE_PROVIDERS_PORT by default', async () => {
      const stub = useServerStub();
      const previous = process.env.FAKE_PROVIDERS_PORT;
      process.env.FAKE_PROVIDERS_PORT = '3998';

      try {
        await jest.isolateModulesAsync(async () => {
          const { FakeProvidersServer: IsolatedServer } = await import('./fake-providers.server');
          await new IsolatedServer().init();
        });
      } finally {
        if (previous === undefined) {
          delete process.env.FAKE_PROVIDERS_PORT;
        } else {
          process.env.FAKE_PROVIDERS_PORT = previous;
        }
      }

      expect(stub.listen).toHaveBeenCalledWith(3998, expect.any(Function));
    });

    it('should fail to start when the port cannot be listened on', async () => {
      const error = new Error('listen EADDRINUSE: address already in use :::3140');
      useServerStub(new ServerStub(error));

      await expect(new FakeProvidersServer(3140).init()).rejects.toBe(error);
    });
  });

  describe('should_pass_each_request_to_the_controller', () => {
    it('should pass the method, URL and whole body, and write the JSON reply', async () => {
      // Arrange
      useServerStub();
      await new FakeProvidersServer(3140).init();
      jest.mocked(fakeProvidersController.handle).mockReturnValue({ status: 200, body: { messages: [] } });
      const { res, replied, writeHead, end } = buildResponse();

      // Act
      capturedHandler()(buildRequest('POST', '/_test/fail-next', ['{"descrip', 'tion":"Blocked"}']), res);
      await replied;

      // Assert
      expect(jest.mocked(fakeProvidersController.handle).mock.calls).toEqual([
        ['POST', '/_test/fail-next', '{"description":"Blocked"}'],
      ]);
      expect(writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
      expect(end).toHaveBeenCalledWith('{"messages":[]}');
    });

    it("should write the controller's status", async () => {
      useServerStub();
      await new FakeProvidersServer(3140).init();
      jest.mocked(fakeProvidersController.handle).mockReturnValue({ status: 404, body: { error: 'Not found' } });
      const { res, replied, writeHead, end } = buildResponse();

      capturedHandler()(buildRequest('GET', '/nothing', []), res);
      await replied;

      expect(writeHead).toHaveBeenCalledWith(404, { 'Content-Type': 'application/json' });
      expect(end).toHaveBeenCalledWith('{"error":"Not found"}');
    });

    it('should answer 500 and log when the request cannot be read', async () => {
      // Arrange
      useServerStub();
      await new FakeProvidersServer(3140).init();
      const error = new Error('aborted');
      const { res, replied, writeHead, end } = buildResponse();

      // Act
      capturedHandler()(buildRequest('POST', '/_test/reset', error), res);
      await replied;

      // Assert
      expect(fakeProvidersController.handle).not.toHaveBeenCalled();
      expect(writeHead).toHaveBeenCalledWith(500, { 'Content-Type': 'application/json' });
      expect(end).toHaveBeenCalledWith('{"error":"Internal Server Error"}');
      expect(jest.mocked(logger.error).mock.calls).toEqual([['[FAKE PROVIDERS] POST /_test/reset failed', error]]);
    });
  });

  describe('should_close_the_listener_on_shutdown', () => {
    it('should close the server it started', async () => {
      const stub = useServerStub();
      const server = new FakeProvidersServer(3140);
      await server.init();

      await server.shutdown();

      expect(stub.close).toHaveBeenCalledTimes(1);
    });

    it('should do nothing when it was never started', async () => {
      await expect(new FakeProvidersServer(3140).shutdown()).resolves.toBeUndefined();
    });

    it('should close only once', async () => {
      const stub = useServerStub();
      const server = new FakeProvidersServer(3140);
      await server.init();

      await server.shutdown();
      await server.shutdown();

      expect(stub.close).toHaveBeenCalledTimes(1);
    });

    it('should pass a close error through', async () => {
      const error = new Error('Server is not running.');
      useServerStub(new ServerStub(undefined, error));
      const server = new FakeProvidersServer(3140);
      await server.init();

      await expect(server.shutdown()).rejects.toBe(error);
    });
  });

  describe('should_identify_itself_to_the_app_life_cycle', () => {
    it('should be named, run after the service, and depend on nothing', () => {
      const server = new FakeProvidersServer(3140);

      expect(server.getName()).toBe('fake-providers-server');
      expect(server.getPriority()).toBe(AppRunPriority.Low);
      expect(server.getDependencies()).toEqual([]);
    });
  });
});
