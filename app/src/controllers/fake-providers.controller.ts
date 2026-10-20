import { z } from 'zod';

import fakeMailgunApiService from '@/services/email-provider/fake-mailgun-api.service';

export interface FakeProvidersReply {
  status: number;
  body: object;
}

const NOT_JSON_OBJECT = 'The body must be a JSON object';

const OutboxQuerySchema = z.object({
  to: z.string().min(1, { error: 'to must not be empty' }).optional(),
});

const FailNextBodySchema = z.object(
  {
    description: z
      .string({ error: 'description must be a non-empty string' })
      .min(1, { error: 'description must be a non-empty string' })
      .optional(),
  },
  { error: NOT_JSON_OBJECT }
);

const OK: FakeProvidersReply = { status: 200, body: {} };
const NOT_FOUND: FakeProvidersReply = { status: 404, body: { error: 'Not found' } };

function badRequest(error: string): FakeProvidersReply {
  return { status: 400, body: { error } };
}

// The /_test endpoints served while PROVIDERS=fake. Kept free of HTTP plumbing so each route is tested directly.
class FakeProvidersController {
  handle(method: string | undefined, url: string | undefined, body: string): FakeProvidersReply {
    const { pathname, searchParams } = new URL(url ?? '', 'http://localhost');

    if (method === 'GET' && pathname === '/_test/outbox') {
      return this.getOutbox(searchParams.get('to') ?? undefined);
    }
    if (method === 'POST' && pathname === '/_test/fail-next') {
      return this.failNext(body);
    }
    if (method === 'POST' && pathname === '/_test/reset') {
      fakeMailgunApiService.reset();
      return OK;
    }
    return NOT_FOUND;
  }

  private getOutbox(to: string | undefined): FakeProvidersReply {
    const query = OutboxQuerySchema.safeParse({ to });
    if (!query.success) {
      return badRequest(query.error.issues[0].message);
    }
    return { status: 200, body: { messages: fakeMailgunApiService.getOutbox(query.data.to) } };
  }

  private failNext(body: string): FakeProvidersReply {
    let parsed: unknown = {};
    if (body !== '') {
      try {
        parsed = JSON.parse(body);
      } catch {
        return badRequest(NOT_JSON_OBJECT);
      }
    }

    const request = FailNextBodySchema.safeParse(parsed);
    if (!request.success) {
      return badRequest(request.error.issues[0].message);
    }

    fakeMailgunApiService.failNextSend(request.data.description);
    return OK;
  }
}

export default new FakeProvidersController();
