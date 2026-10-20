import mailgunApiService, { MailgunApiService } from './mailgun-api.service';

const MESSAGES_URL = 'https://mailgun.invalid/v3/example.test/messages';
const AUTH_HEADER = `Basic ${Buffer.from('api:test-api-key').toString('base64')}`;

interface SentRequest {
  url: string;
  method: string | undefined;
  headers: Record<string, string>;
  form: FormData;
}

function sentRequest(): SentRequest {
  const [input, init] = jest.mocked(fetch).mock.calls[0];
  return {
    url: String(input),
    method: init?.method,
    headers: init?.headers as Record<string, string>,
    form: init?.body as FormData,
  };
}

function fileEntries(form: FormData, field: string): [name: string, content: Promise<string>][] {
  return form.getAll(field).map((entry) => [(entry as File).name, (entry as File).text()]);
}

describe('MailgunApiService - sendEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(fetch).mockResolvedValue(new Response('{"message":"Queued. Thank you."}', { status: 200 }));
  });

  describe('should_post_the_email_to_mailgun_when_it_is_sent', () => {
    it('should send one authenticated POST to the messages URL', async () => {
      // Act
      await mailgunApiService.sendEmail('billing@example.test', ['a@example.test'], 'Invoice', '<p>Hi</p>');

      // Assert
      expect(fetch).toHaveBeenCalledTimes(1);
      const request = sentRequest();
      expect(request.url).toBe(MESSAGES_URL);
      expect(request.method).toBe('POST');
      expect(request.headers).toEqual({ Authorization: AUTH_HEADER });
    });

    it('should put the sender, recipients, subject and HTML body in the form', async () => {
      await mailgunApiService.sendEmail(
        'billing@example.test',
        ['a@example.test', 'b@example.test'],
        'Invoice',
        '<p>Hi</p>'
      );

      const { form } = sentRequest();
      expect(form.get('from')).toBe('billing@example.test');
      expect(form.getAll('to')).toEqual(['a@example.test,b@example.test']);
      expect(form.get('subject')).toBe('Invoice');
      expect(form.get('html')).toBe('<p>Hi</p>');
    });

    it('should leave out copies, reply-to and files when none are given', async () => {
      await mailgunApiService.sendEmail('billing@example.test', ['a@example.test'], 'Invoice', '<p>Hi</p>');

      const { form } = sentRequest();
      expect([...form.keys()]).toEqual(['from', 'to', 'subject', 'html']);
    });

    it('should add copies, blind copies and reply-to when they are given', async () => {
      await mailgunApiService.sendEmail(
        'billing@example.test',
        ['a@example.test'],
        'Invoice',
        '<p>Hi</p>',
        {},
        {},
        ['cc1@example.test', 'cc2@example.test'],
        ['bcc@example.test'],
        'support@example.test'
      );

      const { form } = sentRequest();
      expect(form.getAll('cc')).toEqual(['cc1@example.test,cc2@example.test']);
      expect(form.getAll('bcc')).toEqual(['bcc@example.test']);
      expect(form.getAll('h:Reply-To')).toEqual(['support@example.test']);
    });

    it('should add each attachment and inline file under its own field with its name', async () => {
      // Arrange
      const attachments = { 'invoice.pdf': new Blob(['%PDF-1.7']), 'terms.txt': new Blob(['terms']) };
      const inline = { 'logo.png': new Blob(['PNG']) };

      // Act
      await mailgunApiService.sendEmail(
        'billing@example.test',
        ['a@example.test'],
        'Invoice',
        '<img src="cid:logo.png">',
        attachments,
        inline
      );

      // Assert
      const { form } = sentRequest();
      const attached = fileEntries(form, 'attachment');
      expect(attached.map(([name]) => name)).toEqual(['invoice.pdf', 'terms.txt']);
      expect(await Promise.all(attached.map(([, content]) => content))).toEqual(['%PDF-1.7', 'terms']);
      const inlined = fileEntries(form, 'inline');
      expect(inlined.map(([name]) => name)).toEqual(['logo.png']);
      expect(await inlined[0][1]).toBe('PNG');
    });
  });

  describe('should_reject_when_mailgun_does_not_accept_the_email', () => {
    it('should reject with the status and the response text', async () => {
      jest.mocked(fetch).mockResolvedValueOnce(new Response('Forbidden', { status: 401 }));

      await expect(
        mailgunApiService.sendEmail('billing@example.test', ['a@example.test'], 'Invoice', '<p>Hi</p>')
      ).rejects.toThrow('Mailgun API error: 401 - Forbidden');
    });

    it('should reject a server error with an empty body', async () => {
      jest.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 503 }));

      await expect(
        mailgunApiService.sendEmail('billing@example.test', ['a@example.test'], 'Invoice', '<p>Hi</p>')
      ).rejects.toThrow('Mailgun API error: 503 - ');
    });

    it('should pass a network error through', async () => {
      const error = new TypeError('fetch failed');
      jest.mocked(fetch).mockRejectedValueOnce(error);

      await expect(
        mailgunApiService.sendEmail('billing@example.test', ['a@example.test'], 'Invoice', '<p>Hi</p>')
      ).rejects.toBe(error);
    });
  });
});

describe('MailgunApiService - post', () => {
  class RecordingMailgunApiService extends MailgunApiService {
    readonly forms: FormData[] = [];

    constructor(private readonly reply: Response) {
      super();
    }

    protected override async post(form: FormData): Promise<Response> {
      this.forms.push(form);
      return this.reply;
    }
  }

  it('should be the only network call, so a subclass can answer in place of Mailgun', async () => {
    // Arrange
    const service = new RecordingMailgunApiService(new Response('{"message":"Queued. Thank you."}', { status: 200 }));

    // Act
    await service.sendEmail('billing@example.test', ['a@example.test'], 'Invoice', '<p>Hi</p>');

    // Assert
    expect(fetch).not.toHaveBeenCalled();
    expect(service.forms).toHaveLength(1);
    expect(service.forms[0].get('subject')).toBe('Invoice');
  });

  it("should have the subclass's reply checked as Mailgun's", async () => {
    const service = new RecordingMailgunApiService(new Response('{"message":"Blocked"}', { status: 400 }));

    await expect(service.sendEmail('billing@example.test', ['a@example.test'], 'Invoice', '<p>Hi</p>')).rejects.toThrow(
      'Mailgun API error: 400 - {"message":"Blocked"}'
    );
  });
});
