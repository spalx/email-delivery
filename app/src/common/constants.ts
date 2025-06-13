import { z } from 'zod';

export const QUEUE_EMAIL_OP = 'EmailOp';

export enum EmailOpJobName {
  SendEmail = 'SendEmail',
}

export enum EmailProvider {
  Mailgun = 'mailgun',
}

export enum QueueJobPriority {
  Critical = 1,
  High = 5,
  Normal = 10,
  Low = 20,
}

export const SendEmailDTOSchema = z.object({
  from: z.string({
    required_error: "from is required",
    invalid_type_error: "from must be a string"
  }).min(1, "from cannot be empty"),

  to: z
  .array(z.string().min(1, "recipient email cannot be empty"), {
    required_error: "to is required"
  })
  .nonempty({ message: "to must not be empty" }),

  subject: z.string({
    required_error: "subject is required",
    invalid_type_error: "subject must be a string"
  }).min(1, "subject cannot be empty"),

  body: z.string({
    required_error: "body is required",
    invalid_type_error: "body must be a string"
  }).min(1, "body cannot be empty"),

  attachments: z.record(z.any()).optional()
  .refine(val => val === undefined || Object.keys(val).length > 0, {
    message: "attachments cannot be empty",
  }),

  inline: z.record(z.any()).optional()
  .refine(val => val === undefined || Object.keys(val).length > 0, {
    message: "inline cannot be empty",
  }),

  bcc: z.array(z.string().min(1, "bcc email cannot be empty")).optional()
  .refine(val => val === undefined || val.length > 0, {
    message: "bcc cannot be empty",
  }),

  cc: z.array(z.string().min(1, "cc email cannot be empty")).optional()
  .refine(val => val === undefined || val.length > 0, {
    message: "cc cannot be empty",
  }),

  replyTo: z.string().optional()
  .refine(val => val === undefined || val.trim().length > 0, {
    message: "replyTo cannot be empty",
  }),
});
