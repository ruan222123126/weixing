'use strict';

class AppError extends Error {
  constructor(message, code = 'BAD_REQUEST', statusCode = 400, details = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function assert(condition, message, code = 'BAD_REQUEST', statusCode = 400, details = null) {
  if (!condition) {
    throw new AppError(message, code, statusCode, details);
  }
}

module.exports = {
  AppError,
  assert
};
