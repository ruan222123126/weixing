'use strict';

const { createMemoryStore } = require('./store-memory');
const { createCloudStore } = require('./store-cloud');
const { nowISO, createId } = require('./utils');

function getWxContextOpenId() {
  try {
    const cloud = require('wx-server-sdk');
    const wxContext = typeof cloud.getWXContext === 'function' ? cloud.getWXContext() : null;
    return (wxContext && wxContext.OPENID) || null;
  } catch (error) {
    return null;
  }
}

function inspectOpenIdSources(event = {}, context = {}) {
  return {
    eventOpenid: event.openid || null,
    contextOpenid: context.OPENID || null,
    weixinContextOpenid: (context.weixinContext && context.weixinContext.OPENID) || null,
    wxContextOpenid: getWxContextOpenId(),
    eventKeys: Object.keys(event || {}),
    contextKeys: Object.keys(context || {})
  };
}

function resolveOpenId(event = {}, context = {}) {
  const sources = inspectOpenIdSources(event, context);
  return sources.eventOpenid || sources.contextOpenid || sources.weixinContextOpenid || sources.wxContextOpenid || null;
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
    resolveOpenId: () => resolveOpenId(event, context),
    inspectOpenIdSources: () => inspectOpenIdSources(event, context)
  };
}

module.exports = {
  createRuntimeServices,
  resolveOpenId,
  inspectOpenIdSources
};
