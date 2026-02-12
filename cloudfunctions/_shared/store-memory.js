'use strict';

const { createId } = require('./utils');

const DEFAULT_COLLECTIONS = [
  'users',
  'projects',
  'expense_claims',
  'expense_items',
  'project_revenue',
  'project_labor_allocations',
  'project_tax_fees',
  'commission_rules',
  'project_settlements',
  'import_jobs',
  'operation_logs'
];

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMemoryStore(seed = {}) {
  const state = {};
  for (const collection of DEFAULT_COLLECTIONS) {
    state[collection] = deepClone(seed[collection] || []);
  }

  function ensure(collection) {
    if (!state[collection]) {
      state[collection] = [];
    }
    return state[collection];
  }

  return {
    kind: 'memory',

    dump() {
      return deepClone(state);
    },

    async insert(collection, doc) {
      const row = deepClone(doc);
      if (!row._id) {
        row._id = createId('row');
      }
      ensure(collection).push(row);
      return deepClone(row);
    },

    async list(collection) {
      return deepClone(ensure(collection));
    },

    async findOne(collection, query) {
      const rows = ensure(collection);
      const found = rows.find((row) => Object.entries(query).every(([key, value]) => row[key] === value));
      return found ? deepClone(found) : null;
    },

    async findMany(collection, query) {
      const rows = ensure(collection).filter((row) => Object.entries(query).every(([key, value]) => row[key] === value));
      return deepClone(rows);
    },

    async updateMany(collection, query, patch) {
      const rows = ensure(collection);
      let changed = 0;
      for (const row of rows) {
        if (Object.entries(query).every(([key, value]) => row[key] === value)) {
          Object.assign(row, deepClone(patch));
          changed += 1;
        }
      }
      return changed;
    },

    async deleteMany(collection, query) {
      const rows = ensure(collection);
      const keep = [];
      let deleted = 0;
      for (const row of rows) {
        const matched = Object.entries(query).every(([key, value]) => row[key] === value);
        if (matched) {
          deleted += 1;
        } else {
          keep.push(row);
        }
      }
      state[collection] = keep;
      return deleted;
    },

    async updateById(collection, idField, idValue, patch) {
      const rows = ensure(collection);
      const row = rows.find((item) => item[idField] === idValue);
      if (!row) {
        return null;
      }
      Object.assign(row, deepClone(patch));
      return deepClone(row);
    },

    async upsertOne(collection, query, patch, createDoc = null) {
      const existing = await this.findOne(collection, query);
      if (existing) {
        const merged = { ...existing, ...deepClone(patch) };
        await this.updateMany(collection, query, merged);
        return merged;
      }
      const toCreate = { ...deepClone(query), ...deepClone(createDoc || {}), ...deepClone(patch) };
      return this.insert(collection, toCreate);
    }
  };
}

module.exports = {
  createMemoryStore
};
