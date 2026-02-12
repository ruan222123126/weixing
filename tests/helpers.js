'use strict';

const { createMemoryStore } = require('../cloudfunctions/_shared/store-memory');
const { createId, nowISO } = require('../cloudfunctions/_shared/utils');

function createTestServices(seed = {}) {
  const store = createMemoryStore(seed);
  let seq = 0;

  return {
    store,
    now: () => {
      seq += 1;
      return new Date(Date.UTC(2026, 0, 1, 0, 0, seq)).toISOString();
    },
    createId: (prefix) => `${prefix}_${seq}_${createId('t').slice(-4)}`,
    config: {
      adminPhones: [],
      financePhones: []
    },
    fetch: async () => ({ ok: true, json: async () => ({ items: [] }) }),
    resolveOpenId: () => null,
    nowISO
  };
}

module.exports = {
  createTestServices
};
