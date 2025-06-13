export abstract class BaseError extends Error {
  constructor(message: string) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
  }

  abstract get code(): number;
}

export class BadRequestError extends BaseError {
  readonly code: number = 400;
}

export class UnauthorizedError extends BaseError {
  readonly code: number = 401;
}

export class ForbiddenError extends BaseError {
  readonly code: number = 403;
}

export class NotFoundError extends BaseError {
  readonly code: number = 404;
}

export class InternalServerError extends BaseError {
  readonly code: number = 500;
}
