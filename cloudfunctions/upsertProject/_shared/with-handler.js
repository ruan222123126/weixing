'use strict';

const { AppError } = require('./errors');
const { handlers } = require('./handlers');
const { createRuntimeServices } = require('./runtime');

function withHandler(name) {
  const fn = handlers[name];
  if (typeof fn !== 'function') {
    throw new Error(`未知 handler: ${name}`);
  }

  return async function main(event = {}, context = {}) {
    const services = createRuntimeServices({ event, context });
    try {
      return await fn(event, services, context);
    } catch (error) {
      if (error instanceof AppError) {
        return {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            statusCode: error.statusCode,
            details: error.details || null
          }
        };
      }
      return {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error && error.message ? error.message : '未知异常',
          statusCode: 500
        }
      };
    }
  };
}

module.exports = {
  withHandler
};
