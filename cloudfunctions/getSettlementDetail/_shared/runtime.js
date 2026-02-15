'use strict';

const { createMemoryStore } = require('./store-memory');
const { createCloudStore } = require('./store-cloud');
const { nowISO, createId } = require('./utils');

function resolveOpenId(event = {}, context = {}) {
  return event.openid || context.OPENID || (context.weixinContext && context.weixinContext.OPENID) || null;
}

function createRuntimeServices({ event = {}, context = {} } = {}) {
  if (event.__services) {
    return event.__services;
  }

  let store;
  try {
    store = createCloudStore();
  } catch (error) {
    // Local fallback, useful in non-cloud environments.
    store = createMemoryStore();
  }

  return {
    store,
    now: nowISO,
    createId,
    fetch: global.fetch,
    config: {
      erpEndpoint: process.env.ERP_ENDPOINT || '',
      erpToken: process.env.ERP_TOKEN || '',
      adminPhones: (process.env.ADMIN_PHONES || '').split(',').map((v) => v.trim()).filter(Boolean),
      financePhones: (process.env.FINANCE_PHONES || '').split(',').map((v) => v.trim()).filter(Boolean)
    },
    resolveOpenId: () => resolveOpenId(event, context)
  };
}

module.exports = {
  createRuntimeServices,
  resolveOpenId
};
