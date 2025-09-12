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
