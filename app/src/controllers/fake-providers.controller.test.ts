import fakeMailgunApiService from '@/services/email-provider/fake-mailgun-api.service';
import fakeProvidersController from './fake-providers.controller';

function send(to: string, subject: string): Promise<void> {
  return fakeMailgunApiService.sendEmail('billing@example.test', [to], subject, '<p>Hi</p>');
}

describe('FakeProvidersController - handle', () => {
  beforeEach(() => {
    fakeMailgunApiService.reset();
  });

  describe('should_read_the_outbox', () => {
    beforeEach(async () => {
      await send('a@example.test', 'one');
      await send('b@example.test', 'two');
    });

    it('should reply with every recorded email, oldest first', () => {
      // Act
      const reply = fakeProvidersController.handle('GET', '/_test/outbox', '');

      // Assert
      expect(reply).toEqual({ status: 200, body: { messages: fakeMailgunApiService.getOutbox() } });
      expect(reply.body).toMatchObject({ messages: [{ subject: 'one' }, { subject: 'two' }] });
    });

    it('should reply with only the emails sent to the address in the to parameter', () => {
      const reply = fakeProvidersController.handle('GET', '/_test/outbox?to=b%40example.test', '');

      expect(reply).toEqual({ status: 200, body: { messages: fakeMailgunApiService.getOutbox('b@example.test') } });
      expect(reply.body).toMatchObject({ messages: [{ subject: 'two' }] });
    });

    it('should decode the to parameter', () => {
      const reply = fakeProvidersController.handle('GET', '/_test/outbox?to=a%2Bx%40example.test', '');

      expect(reply).toEqual({ status: 200, body: { messages: [] } });
    });

    it('should refuse an empty to parameter', () => {
      expect(fakeProvidersController.handle('GET', '/_test/outbox?to=', '')).toEqual({
        status: 400,
        body: { error: 'to must not be empty' },
      });
    });
  });

  describe('should_make_the_next_send_fail', () => {
    it('should fail the next send with the description given', async () => {
      // Act
      const reply = fakeProvidersController.handle('POST', '/_test/fail-next', '{"description":"Blocked"}');

      // Assert
      expect(reply).toEqual({ status: 200, body: {} });
      await expect(send('a@example.test', 'hi')).rejects.toThrow('Mailgun API error: 400 - {"message":"Blocked"}');
    });

    it.each(['', '{}'])('should fail the next send with Simulated failure for the body %j', async (body) => {
      expect(fakeProvidersController.handle('POST', '/_test/fail-next', body)).toEqual({ status: 200, body: {} });

      await expect(send('a@example.test', 'hi')).rejects.toThrow('{"message":"Simulated failure"}');
    });

    it.each([
      ['not JSON', '{description', 'The body must be a JSON object'],
      ['an array', '[]', 'The body must be a JSON object'],
      ['null', 'null', 'The body must be a JSON object'],
      ['a number description', '{"description":5}', 'description must be a non-empty string'],
      ['an empty description', '{"description":""}', 'description must be a non-empty string'],
    ])('should refuse %s and leave no failure pending', async (_case, body, error) => {
      // Act
      const reply = fakeProvidersController.handle('POST', '/_test/fail-next', body);

      // Assert
      expect(reply).toEqual({ status: 400, body: { error } });
      await expect(send('a@example.test', 'hi')).resolves.toBeUndefined();
    });
  });

  describe('should_reset_the_fake', () => {
    it('should empty the outbox and cancel a pending failure', async () => {
      // Arrange
      await send('a@example.test', 'one');
      fakeMailgunApiService.failNextSend();

      // Act
      const reply = fakeProvidersController.handle('POST', '/_test/reset', '');

      // Assert
      expect(reply).toEqual({ status: 200, body: {} });
      expect(fakeMailgunApiService.getOutbox()).toEqual([]);
      await expect(send('a@example.test', 'two')).resolves.toBeUndefined();
    });
  });

  describe('should_answer_404_for_anything_else', () => {
    it.each([
      ['GET', '/_test/nothing'],
      ['POST', '/_test/outbox'],
      ['GET', '/_test/reset'],
      ['GET', '/_test/fail-next'],
      ['DELETE', '/_test/outbox'],
      ['GET', '/_test/outbox/'],
      ['GET', '/'],
      [undefined, undefined],
    ])('should answer %s %s with 404', (method, url) => {
      expect(fakeProvidersController.handle(method, url, '')).toEqual({ status: 404, body: { error: 'Not found' } });
    });
  });
});
