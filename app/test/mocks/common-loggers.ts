// Replaces @spalx/common-loggers-pkg in unit tests, so nothing writes to logs/ and tests can assert on log calls.
type LoggerMock = Record<'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug' | 'log', jest.Mock>;

function createLoggerMock(): LoggerMock {
  return {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    http: jest.fn(),
    verbose: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
  };
}

export const logger = createLoggerMock();
export const kafkaLogger = createLoggerMock();
export const httpLogger = createLoggerMock();
